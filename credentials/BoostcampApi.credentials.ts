import type {
	IAuthenticate,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';
import {
	coerceCredentials,
	resolveBoostcampAuthHeaders,
} from '../nodes/Boostcamp/boostcamp.api';

export class BoostcampApi implements ICredentialType {
	name = 'boostcampApi';

	displayName = 'Boostcamp API';

	icon: Icon = {
		light: 'file:../nodes/Boostcamp/boostcamp.svg',
		dark: 'file:../nodes/Boostcamp/boostcamp.dark.svg',
	};

	documentationUrl = 'https://github.com/Aodaruma/n8n-nodes-boostcamp#readme';

	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		const headers = await resolveBoostcampAuthHeaders(
			coerceCredentials(credentials as Record<string, unknown>),
		);

		requestOptions.headers = {
			...(requestOptions.headers ?? {}),
			...headers,
		};

		return requestOptions;
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.apiBaseUrl || "https://newapi.boostcamp.app/api/www"}}',
			url: '/users/get',
			method: 'POST',
			body: {},
		},
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Auth Mode',
			name: 'authMode',
			type: 'options',
			options: [
				{
					name: 'Email + Password',
					value: 'emailPassword',
				},
				{
					name: 'Token',
					value: 'token',
				},
				{
					name: 'Session Cookie',
					value: 'sessionCookie',
				},
			],
			default: 'emailPassword',
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			default: '',
			displayOptions: {
				show: {
					authMode: ['emailPassword'],
				},
			},
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			displayOptions: {
				show: {
					authMode: ['emailPassword'],
				},
			},
		},
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			displayOptions: {
				show: {
					authMode: ['token'],
				},
			},
		},
		{
			displayName: 'Session Cookie',
			name: 'sessionCookie',
			type: 'string',
			typeOptions: {
				password: true,
				rows: 3,
			},
			default: '',
			displayOptions: {
				show: {
					authMode: ['sessionCookie'],
				},
			},
		},
		{
			displayName: 'API Base URL',
			name: 'apiBaseUrl',
			type: 'string',
			default: 'https://newapi.boostcamp.app/api/www',
			description: 'Override only if Boostcamp changes its API hostname or path',
		},
	];
}
