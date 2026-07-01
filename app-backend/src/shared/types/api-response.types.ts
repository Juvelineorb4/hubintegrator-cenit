export interface ApiResponse<T> {
  success: boolean;
  data: T;
  total?: number;
}

export interface ApiError {
  success: false;
  message: string;
}
