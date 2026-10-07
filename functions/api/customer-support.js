import { handleSupportRequest } from '../_shared/grok-support.js';

export async function onRequest(context) {
  return handleSupportRequest(context.request, context.env);
}
