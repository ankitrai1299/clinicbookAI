// A tiny FHIR R4 client over a pluggable TRANSPORT. Splitting transport from the
// client lets us (a) run the real thing over HTTP against OpenEMR/Epic, and
// (b) unit-test adapters by injecting canned Bundles — no network. The client
// only knows FHIR verbs (search/read/create); auth + base URL live in the
// transport.

import axios, { type AxiosInstance } from 'axios';

import type { FhirBundle } from './types.js';

export interface FhirTransport {
  get<T>(path: string, query?: Record<string, string | string[]>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

// Real HTTP transport. baseUrl points at the FHIR root (e.g.
// https://emr.example.com/apis/default/fhir); token is a Bearer access token.
export class HttpFhirTransport implements FhirTransport {
  private http: AxiosInstance;

  constructor(baseUrl: string, token?: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      timeout: 15_000,
      headers: {
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  }

  async get<T>(path: string, query?: Record<string, string | string[]>): Promise<T> {
    const res = await this.http.get<T>(path, { params: query });
    return res.data;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.http.post<T>(path, body);
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
}
