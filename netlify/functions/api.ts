import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import app from "../../server";

export const handler = async (event: any, context: any) => {
  return new Promise((resolve) => {
    // 1. Reconstruct request URL and method
    // In Netlify, event.path is the request path (e.g. /api/status)
    const url = event.path + (event.queryStringParameters 
      ? "?" + new URLSearchParams(event.queryStringParameters).toString() 
      : "");
    const method = event.httpMethod;

    // 2. Create mock socket and incoming message
    const socket = new Socket();
    
    // Resolve client IP from x-forwarded-for
    const xForwardedFor = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
    const ip = xForwardedFor ? xForwardedFor.split(',')[0].trim() : '127.0.0.1';
    Object.defineProperty(socket, 'remoteAddress', { value: ip, writable: false });
    
    const req = new IncomingMessage(socket);
    req.url = url;
    req.method = method;
    req.headers = {};
    for (const [key, value] of Object.entries(event.headers)) {
      req.headers[key.toLowerCase()] = value as string;
    }

    // Determine request body and content length
    let bodyBuffer: Buffer | null = null;
    if (event.body) {
      bodyBuffer = event.isBase64Encoded 
        ? Buffer.from(event.body, 'base64') 
        : Buffer.from(event.body);
      req.headers['content-length'] = String(bodyBuffer.length);
    }

    // 3. Create mock ServerResponse
    const res = new ServerResponse(req);
    const responseHeaders: Record<string, string | string[]> = {};
    let responseBody = Buffer.alloc(0);

    res.writeHead = (statusCode: number, reasonOrHeaders?: any, headers?: any) => {
      res.statusCode = statusCode;
      const actualHeaders = headers || reasonOrHeaders;
      if (actualHeaders) {
        for (const [key, val] of Object.entries(actualHeaders)) {
          if (val !== undefined && val !== null) {
            responseHeaders[key] = val as string | string[];
          }
        }
      }
      return res;
    };

    res.setHeader = (name: string, value: string | number | readonly string[]) => {
      responseHeaders[name.toLowerCase()] = value as string | string[];
      return res;
    };

    res.getHeader = (name: string) => {
      return responseHeaders[name.toLowerCase()];
    };

    res.write = (chunk: any, encodingOrCb?: any, cb?: any) => {
      const chunkBuffer = typeof chunk === 'string' ? Buffer.from(chunk, encodingOrCb) : chunk;
      responseBody = Buffer.concat([responseBody, chunkBuffer]);
      return true;
    };

    res.end = (chunk?: any, encodingOrCb?: any, cb?: any) => {
      if (chunk) {
        const chunkBuffer = typeof chunk === 'string' ? Buffer.from(chunk, encodingOrCb) : chunk;
        responseBody = Buffer.concat([responseBody, chunkBuffer]);
      }

      // Format headers map
      const headersMap: Record<string, string> = {};
      for (const [key, val] of Object.entries(responseHeaders)) {
        if (Array.isArray(val)) {
          headersMap[key] = val.join(', ');
        } else {
          headersMap[key] = String(val);
        }
      }

      resolve({
        statusCode: res.statusCode || 200,
        headers: headersMap,
        body: responseBody.toString('base64'),
        isBase64Encoded: true
      });
      return res;
    };

    // 4. Feed request to the Express application
    app(req, res);

    if (bodyBuffer) {
      req.push(bodyBuffer);
    }
    req.push(null); // End request stream
  });
};
