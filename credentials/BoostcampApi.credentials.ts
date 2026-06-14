import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class BoostcampApi implements ICredentialType {
	name = 'boostcampApi';

	displayName = 'Boostcamp API';

	icon: Icon = {
		light: 'file:../nodes/Boostcamp/boostcamp.svg',
		dark: 'file:../nodes/Boostcamp/boostcamp.dark.svg',
	};

	documentationUrl = 'https://github.com/Aodaruma/n8n-nodes-boostcamp#readme';

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Accept: '*/*',
				'Content-Type': 'application/json; charset=UTF-8',
				Origin: 'https://www.boostcamp.app',
				Referer: 'https://www.boostcamp.app/',
				Authorization:
					'={{$credentials.authMode === "token" && $credentials.token ? "FirebaseIdToken:" + $credentials.token : undefined}}',
				Cookie:
					'={{$credentials.authMode === "sessionCookie" ? $credentials.sessionCookie : undefined}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.apiBaseUrl || "https://newapi.boostcamp.app/api/www"}}',
			url: '/users/get',
			method: 'POST',
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
