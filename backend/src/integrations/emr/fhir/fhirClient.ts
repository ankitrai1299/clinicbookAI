// A tiny FHIR R4 client over a pluggable TRANSPORT. Splitting transport from the
// client lets us (a) run the real thing over HTTP against OpenEMR/Epic, and
// (b) unit-test adapters by injecting canned Bundles — no network. The client
// only knows FHIR verbs (search/read/create); auth + base URL live in the
// transport.

import axios, { type AxiosInstance } from 'axios';
import https from 'node:https';

import type { FhirBundle } from './types.js';

export interface FhirTransport {
  get<T>(path: string, query?: Record<string, string | string[]>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
}

// Resolves to a Bearer token. A static string for a ready sandbox token, or an
// async provider (see openEmrAuth) that fetches + refreshes an OAuth2 token.
export type TokenSource = string | (() => Promise<string>);

// Real HTTP transport. baseUrl points at the FHIR root (e.g.
// https://emr.example.com/apis/default/fhir); token is resolved per request so
// an OAuth2 access token can refresh without rebuilding the client.
export class HttpFhirTransport implements FhirTransport {
  private http: AxiosInstance;

  constructor(baseUrl: string, token?: TokenSource, opts: { insecureTls?: boolean } = {}) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      timeout: 15_000,
      headers: {
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json'
      },
      // FHIR wants repeated params (e.g. start=ge..&start=lt..), NOT axios's
      // default bracketed form (start[]=..), which servers reject as unknown.
      paramsSerializer: { indexes: null },
      // LOCAL DEV ONLY: a self-hosted OpenEMR ships a self-signed cert. Never set
      // this against a real server — it disables TLS verification.
      ...(opts.insecureTls ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {})
    });

    if (token) {
      this.http.interceptors.request.use(async (config) => {
        const bearer = typeof token === 'function' ? await token() : token;
        if (bearer) config.headers.Authorization = `Bearer ${bearer}`;
        return config;
      });
    }
  }

  async get<T>(path: string, query?: Record<string, string | string[]>): Promise<T> {
    const res = await this.http.get<T>(path, { params: query });
    return res.data;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.http.post<T>(path, body);
    return res.data;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await this.http.put<T>(path, body);
    return res.data;
  }
}

export class FhirClient {
  constructor(private readonly transport: FhirTransport) {}

  search<T>(resourceType: string, query?: Record<string, string | string[]>): Promise<FhirBundle<T>> {
    return this.transport.get<FhirBundle<T>>(`/${resourceType}`, query);
  }

  read<T>(resourceType: string, id: string): Promise<T> {
    return this.transport.get<T>(`/${resourceType}/${id}`);
  }

  create<T>(resourceType: string, body: unknown): Promise<T> {
    return this.transport.post<T>(`/${resourceType}`, body);
  }

  update<T>(resourceType: string, id: string, body: unknown): Promise<T> {
    return this.transport.put<T>(`/${resourceType}/${id}`, body);
  }
}
