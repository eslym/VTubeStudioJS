
export class VTubeStudioError extends Error {
    public thrownBy?: any;

    constructor(public readonly data: Readonly<IApiError['data']>, public readonly requestID: string) {
        super(`${data.message} (Error Code: ${data.errorID} ${ErrorCode[data.errorID] ?? ErrorCode.Unknown}) (Request ID: ${requestID})`)
        this.name = this.constructor.name
        Object.setPrototypeOf(this, new.target.prototype)
    }
}

export enum ErrorCode {
    Unknown = NaN,

    // Websocket Closed
    MessageBusError = -3,
    MessageBusClosed = -2,

    // General
    InternalClientError = -1,
    InternalServerError = 0,
    APIAccessDeactivated = 1,
    JSONInvalid = 2,
    APINameInvalid = 3,
    APIVersionInvalid = 4,
    RequestIDInvalid = 5,
    RequestTypeMissingOrEmpty = 6,
    RequestTypeUnknown = 7,
    RequestRequiresAuthetication = 8,

    // AuthenticationToken
    TokenRequestDenied = 50,
    TokenRequestCurrentlyOngoing = 51,
    TokenRequestPluginNameInvalid = 52,
    TokenRequestDeveloperNameInvalid = 53,
    TokenRequestPluginIconInvalid = 54,

    // Authentication
    AuthenticationTokenMissing = 100,
    AuthenticationPluginNameMissing = 101,
    AuthenticationPluginDeveloperMissing = 102,

    // ModelLoad
    ModelIDMissing = 150,
    ModelIDInvalid = 151,
    ModelIDNotFound = 152,
    ModelLoadCooldownNotOver = 153,
    CannotCurrentlyChangeModel = 154,

    // HotkeyTrigger
    HotkeyQueueFull = 200,
    HotkeyExecutionFailedBecauseNoModelLoaded = 201,
    HotkeyIDNotFoundInModel = 202,
    HotkeyCooldownNotOver = 203,
    HotkeyIDFoundButHotkeyDataInvalid = 204,
    HotkeyExecutionFailedBecauseBadState = 205,
    HotkeyUnknownExecutionFailure = 206,

    // ColorTint
    ColorTintRequestNoModelLoaded = 250,
    ColorTintRequestMatchOrColorMissing = 251,
    ColorTintRequestInvalidColorValue = 252,

    // MoveModel
    MoveModelRequestNoModelLoaded = 300,
    MoveModelRequestMissingFields = 301,
    MoveModelRequestValuesOutOfRange = 302,

    // ParameterCreation
    CustomParamNameInvalid = 350,
    CustomparamValuesInvalid = 351,
    CustomParamAlreadyCreatedByOtherPlugin = 352,
    CustomParamExplanationTooLong = 353,
    CustomParamDefaultParamNameNotAllowed = 354,
    CustomParamLimitPerPluginExceeded = 355,
    CustomParamLimitTotalExceeded = 356,

    CustomParamDeletionNameInvalid = 400,
    CustomParamDeletionNotFound = 401,
    CustomParamDeletionCreatedByOtherPlugin = 402,
    CustomParamDeletionCannotDeleteDefaultParam = 403,

    // InjectParameterData
    InjectDataNoDataProvided = 450,
    InjectDataValueInvalid = 451,
    InjectDataWeightInvalid = 452,
    InjectDataParamNameNotFound = 453,
    InjectDataParamControlledByOtherPlugin = 454,

    // ParameterValue
    ParameterValueRequestParameterNotFound = 500,
}

export enum HotkeyType {
    Unset = -1,
    TriggerAnimation = 0,
    ChangeIdleAnimation = 1,
    ToggleExpression = 2,
    RemoveAllExpressions = 3,
    MoveModel = 4,
    ChangeBackground = 5,
    ReloadMicrophone = 6,
    ReloadTextures = 7,
    CalibrateCam = 8,
    ChangeVTSModel = 9,
    TakeScreenshot = 10,
}

export interface BaseParameter {
    name: string
    value: number
    min: number
    max: number
    defaultValue: number
}

export interface ILive2DParameter extends BaseParameter { }

export interface IVTSParameter extends BaseParameter {
    addedBy: string
}

export interface IApiMessage<Type extends string, Data extends object> {
    apiName: 'VTubeStudioPublicAPI'
    apiVersion: `${number}.${number}`
    requestID: string
    messageType: Type
    data: Data
}

export interface IApiRequest<Type extends string, Data extends object> extends IApiMessage<`${Type}Request`, Data> { }

export interface IApiResponse<Type extends string, Data extends object> extends IApiMessage<`${Type}Response`, Data> {
    timestamp: number
}

export interface IApiError extends IApiMessage<'APIError', {
    errorID: ErrorCode
    message: string
}> {
    timestamp: number
}

export interface IApiEndpoint<Type extends string, Request extends object, Response extends object> {
    Type: Type
    Request: IApiRequest<Type, Request>
    Response: IApiResponse<Type, Response>
}
