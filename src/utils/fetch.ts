interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

export async function fetchWithAuth(url: string, secret: string, options: FetchOptions = {}): Promise<Response> {
  const headers = {
    'Authorization': `Bearer ${secret}`,
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    console.log(await response.text());
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
}
