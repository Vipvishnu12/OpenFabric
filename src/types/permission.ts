export interface PermissionRecord {
  id: number;
  user_id: string;
  action: string;
  resource: string;
  effect: string;
}
