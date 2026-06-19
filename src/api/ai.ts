import { apiFetch } from './client';

export interface AiChatResponse {
  conversationId: string;
  message: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export const sendAiMessage = (body: { message: string; conversationId?: string }) =>
  apiFetch<AiChatResponse>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getAiHistory = (conversationId: string) =>
  apiFetch<AiMessage[]>(`/api/ai/history/${conversationId}`);
