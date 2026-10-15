export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface AuthorizationRequest {
  access_token: string;
  method: HttpMethod;
  path: string;
}
