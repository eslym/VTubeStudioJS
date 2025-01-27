import { generateID } from './utils'
import { IApiEndpoint, IApiMessage, IApiError, VTubeStudioError } from './types'

type EndpointCall<T extends IApiEndpoint<any, any, any>> = T extends IApiEndpoint<infer _, infer Request, infer Response> ?
    ({} extends Request ?
        ({} extends Response ?
            () => Promise<void> :
            () => Promise<Response>) :
        ({} extends Response ?
            (data: Request) => Promise<void> :
            (data: Request) => Promise<Response>)) :
    never

interface MessageHandler<T extends IApiMessage<any, any> = IApiMessage<any, any>>{
    (msg: T): void;
    context?: {
        timeout: number;
        reject: (reason?: any)=>void;
        requestID: string;
    }
}

function makeRequestMsg<T extends IApiEndpoint<any, any, any>>(type: T['Type'], requestID: string, data: T['Request']['data']): T['Request'] {
    return {
        apiName: 'VTubeStudioPublicAPI',
        apiVersion: '1.0',
        messageType: `${type}Request` as T['Request']['messageType'],
        requestID,
        data,
    }
}

function makeResponseMsg<T extends IApiEndpoint<any, any, any>>(type: T['Type'], requestID: string, data: T['Response']['data']): T['Response'] {
    return {
        apiName: 'VTubeStudioPublicAPI',
        apiVersion: '1.0',
        timestamp: Date.now(),
        messageType: `${type}Response` as T['Response']['messageType'],
        requestID,
        data,
    }
}

function makeErrorMsg(requestID: string, data: IApiError['data']): IApiError {
    return {
        apiName: 'VTubeStudioPublicAPI',
        apiVersion: '1.0',
        timestamp: Date.now(),
        messageType: 'APIError',
        requestID,
        data,
    }
}

function msgIsRequest<T extends IApiEndpoint<any, any, any>>(msg: IApiMessage<any, any>, type: T['Type']): msg is T['Request'] {
    return msg.messageType === `${type}Request`
}

function msgIsResponse<T extends IApiEndpoint<any, any, any>>(msg: IApiMessage<any, any>, type: T['Type']): msg is T['Response'] {
    return msg.messageType === `${type}Response`
}

function msgIsError(msg: IApiMessage<any, any>): msg is IApiError {
    return msg.messageType === 'APIError'
}

/** @internal */
export function createClientCall<T extends IApiEndpoint<any, any, any>>(bus: IMessageBus, type: T['Type']): EndpointCall<T> {
    return ((data: T['Request']['data']) => new Promise<T['Response']['data']>((resolve, reject) => {
        const requestID = generateID(16)
        const handler: MessageHandler = (msg: IApiMessage<any, any>) => {
            if (msg.requestID === requestID) {
                bus.off(handler)
                clearTimeout((handler.context as {timeout: number}).timeout)
                if (msgIsResponse<T>(msg, type))
                    resolve(msg.data ?? {})
                else if (msgIsError(msg))
                    reject(new VTubeStudioError(msg.data ?? {}, requestID))
            }
        }
        handler.context = {
            timeout: setTimeout(() => {
                bus.off(handler)
                reject(new VTubeStudioError({ errorID: -1, message: 'The request timed out.' }, requestID))
            }, 5000),
            reject, requestID
        };
        bus.on(handler)
        bus.send(makeRequestMsg(type, requestID, data ?? {}))
    })) as EndpointCall<T>
}

/** @internal */
export function createServerHandler<T extends IApiEndpoint<any, any, any>>(bus: IMessageBus, type: T['Type'], handler: EndpointCall<T>): MessageHandler {
    return async msg => {
        if (msgIsRequest<T>(msg, type)) {
            try {
                const response = await (handler as any)(msg.data)
                bus.send(makeResponseMsg(type, msg.requestID, response))
            } catch (e) {
                if (e instanceof VTubeStudioError) {
                    bus.send(makeErrorMsg(msg.requestID, e.data))
                } else {
                    bus.send(makeErrorMsg(msg.requestID, { errorID: -1, message: String(e) }))
                }
            }
        }
    }
}

/** @internal */
export function createServerCall<T extends IApiEndpoint<any, any, any>>(bus: IMessageBus, type: T['Type'], handler: EndpointCall<T>): EndpointCall<T> {
    const h = createServerHandler(bus, type, handler)
    bus.on(h)
    return handler
}

export interface IMessageBus {
    send: <T extends IApiMessage<any, any>>(msg: T) => void
    receive: <T extends IApiMessage<any, any>>(msg: T) => void
    on: (handler: MessageHandler) => void
    off: (handler: MessageHandler) => void
}

interface IWebSocketLike {
    send(data: string): void;
    addEventListener(type: 'message' | 'close' | 'error', handler: (event: { data: any }) => void): void;
}

abstract class MessageBusBase implements IMessageBus {
    protected handlers: MessageHandler[] = [];
    protected _isClosed: boolean = false;

    on(handler: MessageHandler<IApiMessage<any, any>>): void {
        if(this._isClosed) return;
        this.handlers.push(handler);
    }

    off(handler: MessageHandler<IApiMessage<any, any>>): void {
        if(this._isClosed) return;
        this.handlers.splice(this.handlers.findIndex(h => h === handler), 1)
    }

    receive<T extends IApiMessage<any, any>>(msg: T): void {
        if(this._isClosed) return;
        for (const handler of [...this.handlers]) handler(msg)
    }

    abstract send<T extends IApiMessage<any, any>>(msg: T): void

    close(){
        this.throwExeception((requestID: string)=>new VTubeStudioError({ errorID: -2, message: 'Message bus closed.' }, requestID));
        this._isClosed = true;
    }

    protected throwExeception(errorSupplier: (requestID: string)=>any){
        for (const handler of [...this.handlers]) {
            if(handler.context !== undefined){
                clearTimeout(handler.context.timeout);
                handler.context.reject(errorSupplier(handler.context.requestID));
            }
        }
        this.handlers = [];
    }
}

export class WebSocketBus extends MessageBusBase {

    constructor(private webSocket: IWebSocketLike) {
        super()
        webSocket.addEventListener('message', e => {
            const msg = JSON.parse(e.data)
            this.receive(msg)
        });
        webSocket.addEventListener('close', () => {
            this.close();
        });
        webSocket.addEventListener('error', (e) => {
            this.throwExeception((requestID: string)=>{
                let err = new VTubeStudioError({ errorID: -2, message: 'Message bus error.' }, requestID);
                err.thrownBy = e;
                return err;
            });
        });
    }

    send<T extends IApiMessage<any, any>>(msg: T): void {
        if(this._isClosed) return;
        this.webSocket.send(JSON.stringify(msg));
    }
}

export class EchoBus extends MessageBusBase {
    private other!: IMessageBus

    static createLinkedPair(): { clientBus: EchoBus, serverBus: EchoBus } {
        const clientBus = new EchoBus()
        const serverBus = clientBus.other as EchoBus
        return { clientBus, serverBus }
    }

    constructor(otherBus?: IMessageBus) {
        super()
        if (otherBus)
            this.other = otherBus
        else
            this.other = new EchoBus(this)
    }

    send<T extends IApiMessage<any, any>>(msg: T): void {
        if(this._isClosed) return;
        this.other.receive(msg)
    }
}
