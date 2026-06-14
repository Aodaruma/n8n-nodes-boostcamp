import type { BoostcampCredentialsData, BoostcampIssue } from './boostcamp.types';

const DEFAULT_API_BASE_URL = 'https://newapi.boostcamp.app/api/www';
const FIREBASE_API_KEY = 'AIzaSyAEJcoGF-5ueF3bvaujcJm2PUV7RHKQwTw';
const FIREBASE_LOGIN_URL = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${FIREBASE_API_KEY}`;

export interface BoostcampApiClient {
	getUserProfile(): Promise<unknown>;
	getTrainingHistory(timezoneOffset: number): Promise<unknown>;
}

interface BoostcampErrorLike extends Error {
	code: string;
	status?: number;
	details?: Record<string, unknown>;
}

interface ResponseLike {
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
	text(): Promise<string>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<ResponseLike>;

export async function createBoostcampClient(
	credentials: BoostcampCredentialsData,
	request: FetchLike = fetch as FetchLike,
): Promise<BoostcampApiClient> {
	const baseUrl = (credentials.apiBaseUrl?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/u, '');
	const headers = await buildAuthHeaders(credentials, request);

	return {
		async getUserProfile() {
			return await postJson(request, `${baseUrl}/users/get`, {}, headers);
		},
		async getTrainingHistory(timezoneOffset: number) {
			return await postJson(
				request,
				`${baseUrl}/programs/history`,
				{ timezone_offset: timezoneOffset },
				headers,
			);
		},
	};
}

export function coerceCredentials(rawValue: Record<string, unknown>): BoostcampCredentialsData {
	return {
		authMode: (rawValue.authMode as BoostcampCredentialsData['authMode']) ?? 'emailPassword',
		email: asOptionalString(rawValue.email),
		password: asOptionalString(rawValue.password),
		token: asOptionalString(rawValue.token),
		sessionCookie: asOptionalString(rawValue.sessionCookie),
		apiBaseUrl: asOptionalString(rawValue.apiBaseUrl),
	};
}

export function toBoostcampIssue(error: unknown): BoostcampIssue {
	if (isBoostcampError(error)) {
		return {
			code: error.code,
			message: error.message,
			details: {
				...(error.status ? { status: error.status } : {}),
				...(error.details ?? {}),
			},
		};
	}

	if (error instanceof Error) {
		return {
			code: 'INVALID_REQUEST',
			message: error.message,
		};
	}

	return {
		code: 'INVALID_REQUEST',
		message: 'An unknown error occurred.',
	};
}

async function buildAuthHeaders(
	credentials: BoostcampCredentialsData,
	request: FetchLike,
): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		Accept: '*/*',
		'Content-Type': 'application/json; charset=UTF-8',
		Origin: 'https://www.boostcamp.app',
		Referer: 'https://www.boostcamp.app/',
		'User-Agent':
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
	};

	switch (credentials.authMode) {
		case 'token': {
			if (!credentials.token?.trim()) {
				throw boostcampError(
					'Boostcamp token is missing.',
					'INVALID_REQUEST',
				);
			}

			headers.Authorization = `FirebaseIdToken:${credentials.token.trim()}`;
			return headers;
		}
		case 'sessionCookie': {
			if (!credentials.sessionCookie?.trim()) {
				throw boostcampError(
					'Boostcamp session cookie is missing.',
					'INVALID_REQUEST',
				);
			}

			headers.Cookie = credentials.sessionCookie.trim();
			return headers;
		}
		case 'emailPassword':
		default: {
			const email = credentials.email?.trim();
			const password = credentials.password ?? '';
			if (!email || !password) {
				throw boostcampError(
					'Boostcamp email and password are required.',
					'INVALID_REQUEST',
				);
			}

			const response = await postJson(
				request,
				FIREBASE_LOGIN_URL,
				{
					email,
					password,
					returnSecureToken: true,
				},
				{
					'Content-Type': 'application/json',
				},
				true,
			);
			const token = asOptionalString((response as Record<string, unknown>).idToken);
			if (!token) {
				throw boostcampError(
					'Boostcamp login did not return a Firebase token.',
					'BOOSTCAMP_AUTH_FAILED',
				);
			}

			headers.Authorization = `FirebaseIdToken:${token}`;
			return headers;
		}
	}
}

async function postJson(
	request: FetchLike,
	url: string,
	body: Record<string, unknown>,
	headers: Record<string, string>,
	isLogin = false,
) {
	let response: ResponseLike;
	try {
		response = await fetchWithTimeout(request, url, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
		});
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw boostcampError(
				'Boostcamp request timed out.',
				'BOOSTCAMP_REQUEST_TIMEOUT',
			);
		}

		throw boostcampError(
			`Boostcamp request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'BOOSTCAMP_API_UNAVAILABLE',
		);
	}

	if (!response.ok) {
		const bodyText = await safeReadText(response);
		throw boostcampError(
			buildFailureMessage(response.status, isLogin),
			mapStatusToErrorCode(response.status, isLogin),
			response.status,
			bodyText ? { body: truncate(bodyText, 600) } : undefined,
		);
	}

	try {
		return await response.json();
	} catch (error) {
		throw boostcampError(
			`Boostcamp returned invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'BOOSTCAMP_PARSE_FAILED',
			response.status,
		);
	}
}

async function fetchWithTimeout(request: FetchLike, url: string, init: RequestInit) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000);

	try {
		return await request(url, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeoutId);
	}
}

function mapStatusToErrorCode(status: number, isLogin: boolean) {
	if (status === 401 || status === 403 || (isLogin && status === 400)) {
		return 'BOOSTCAMP_AUTH_FAILED';
	}

	if (status === 429) {
		return 'BOOSTCAMP_RATE_LIMITED';
	}

	if (status >= 500) {
		return 'BOOSTCAMP_API_UNAVAILABLE';
	}

	return 'INVALID_REQUEST';
}

function buildFailureMessage(status: number, isLogin: boolean) {
	if (status === 401 || status === 403 || (isLogin && status === 400)) {
		return 'Boostcamp authentication failed.';
	}

	if (status === 429) {
		return 'Boostcamp rate limited the request.';
	}

	if (status >= 500) {
		return 'Boostcamp API is currently unavailable.';
	}

	return `Boostcamp request failed with status ${status}.`;
}

async function safeReadText(response: ResponseLike) {
	try {
		return await response.text();
	} catch {
		return '';
	}
}

function truncate(value: string, maxLength: number) {
	return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function asOptionalString(value: unknown) {
	return typeof value === 'string' ? value : undefined;
}

function boostcampError(
	message: string,
	code: string,
	status?: number,
	details?: Record<string, unknown>,
): BoostcampErrorLike {
	const error = new Error(message) as BoostcampErrorLike;
	error.name = 'BoostcampApiError';
	error.code = code;
	error.status = status;
	error.details = details;
	return error;
}

function isBoostcampError(error: unknown): error is BoostcampErrorLike {
	return (
		error instanceof Error &&
		'code' in error &&
		typeof (error as Record<string, unknown>).code === 'string'
	);
}
