import { Bag } from "@paperbits/common";
import { MapiError } from "./../errors/mapiError";
import { HttpClient, HttpResponse, HttpMethod } from "@paperbits/common/http";
import { CaptchaParams } from "../contracts/captchaParams";
import { SignupRequest } from "../contracts/signupRequest";
import { ResetPasswordRequest, ChangePasswordRequest } from "../contracts/resetRequest";
import { IAuthenticator } from "../authentication";
import { DelegationAction } from "../contracts/tenantSettings";
import { ISettingsProvider } from "@paperbits/common/configuration/ISettingsProvider";
import { SettingNames } from "../constants";
import { KnownMimeTypes } from "../models/knownMimeTypes";
import { KnownHttpHeaders } from "../models/knownHttpHeaders";



export class BackendService {
    constructor(
        private readonly settingsProvider: ISettingsProvider,
        private readonly httpClient: HttpClient,
        private readonly authenticator: IAuthenticator
    ) { }

    public async getCaptchaParams(): Promise<CaptchaParams> {
        return await this.sendRequest<CaptchaParams>(HttpMethod.post, "/captcha");
    }

    public async sendSignupRequest(signupRequest: SignupRequest): Promise<void> {
        await this.sendRequest<void>(HttpMethod.post, "/signup", signupRequest);
    }

    public async sendResetRequest(resetRequest: ResetPasswordRequest): Promise<void> {
        await this.sendRequest<any>(HttpMethod.post, "/reset-password-request", resetRequest);
    }

    public async sendChangePassword(changePasswordRequest: ChangePasswordRequest): Promise<void> {
        await this.sendRequest<any>(HttpMethod.post, "/change-password", changePasswordRequest);
    }

    public async getDelegationActionUrl(delegationAction: DelegationAction, delegationParameters: Bag<string>): Promise<string> {
        const payload = {
            delegationAction: delegationAction,
            delegationParameters: delegationParameters
        };

        const response = await this.sendRequest<any>(HttpMethod.post, "/delegation-url", payload);
        return response.url;
    }

    private async sendRequest<TResponse>(method: string, relativeUrl: string, payload?: unknown): Promise<TResponse> {
        const accessToken = await this.authenticator.getAccessTokenAsString();
        const portalBackendUrl = await this.settingsProvider.getSetting<string>(SettingNames.backendUrl) || "";
        const requestUrl = `${portalBackendUrl}${relativeUrl}`;

        let response: HttpResponse<TResponse>;

        try {
            response = await this.httpClient.send<TResponse>({
                url: requestUrl,
                method: method,
                headers: [{ name: KnownHttpHeaders.Authorization, value: accessToken }, { name: KnownHttpHeaders.ContentType, value: KnownMimeTypes.Json }],
                body: !!payload ? JSON.stringify(payload) : null
            });
        }
        catch (error) {
            throw new Error(`Could not get delegation action URL. ${error.stack || error.message}`);
        }

        if (response.statusCode === 200) {
            return response.toObject();
        }

        if (response.statusCode === 400) {
            const responseObj = <any>response.toObject();
            throw new MapiError(responseObj.code, responseObj.message, responseObj.details);
        }

        throw new MapiError("Unhandled", "Unable to complete request.");
    }
}

