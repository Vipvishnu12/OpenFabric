import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app";

const previousEnv = {
  auth0IssuerUrl: process.env.AUTH0_ISSUER_URL,
  auth0Audience: process.env.AUTH0_AUDIENCE,
  auth0ClientId: process.env.AUTH0_CLIENT_ID,
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL,
};

beforeAll(() => {
  process.env.AUTH0_ISSUER_URL = "https://example.auth0.com/";
  process.env.AUTH0_AUDIENCE = "https://api.example.com";
  process.env.AUTH0_CLIENT_ID = "frontend-client-id";
  process.env.PUBLIC_API_BASE_URL = "";
});

afterAll(() => {
  if (previousEnv.auth0IssuerUrl === undefined) {
    delete process.env.AUTH0_ISSUER_URL;
  } else {
    process.env.AUTH0_ISSUER_URL = previousEnv.auth0IssuerUrl;
  }

  if (previousEnv.auth0Audience === undefined) {
    delete process.env.AUTH0_AUDIENCE;
  } else {
    process.env.AUTH0_AUDIENCE = previousEnv.auth0Audience;
  }

  if (previousEnv.auth0ClientId === undefined) {
    delete process.env.AUTH0_CLIENT_ID;
  } else {
    process.env.AUTH0_CLIENT_ID = previousEnv.auth0ClientId;
  }

  if (previousEnv.publicApiBaseUrl === undefined) {
    delete process.env.PUBLIC_API_BASE_URL;
  } else {
    process.env.PUBLIC_API_BASE_URL = previousEnv.publicApiBaseUrl;
  }
});

describe("Auth service API", () => {
  it("GET /config returns public frontend settings", async () => {
    const response = await request(app).get("/config");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      auth0Audience: "https://api.example.com",
      auth0ClientId: "frontend-client-id",
      auth0Domain: "example.auth0.com",
    });
  });

  it("GET / serves the dashboard shell", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Continue with Auth0");
    expect(response.text).toContain("/app.js");
  });

  it("GET /health returns service status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
    expect(response.body).toHaveProperty("service", "auth-service");
  });

  it("POST /authorize rejects missing access token", async () => {
    const response = await request(app).post("/authorize").send({
      method: "GET",
      path: "/transactions",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Invalid request body");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "access_token", message: expect.any(String) }),
      ]),
    );
  });

  it("POST /authorize rejects invalid HTTP method", async () => {
    const response = await request(app).post("/authorize").send({
      access_token: "sample-token",
      method: "OPTIONS",
      path: "/transactions",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "method", message: expect.any(String) }),
      ]),
    );
  });

  it("POST /authorize rejects invalid path", async () => {
    const response = await request(app).post("/authorize").send({
      access_token: "sample-token",
      method: "GET",
      path: "transactions",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "path", message: expect.any(String) }),
      ]),
    );
  });

  it("POST /authorize rejects malformed JSON", async () => {
    const response = await request(app)
      .post("/authorize")
      .set("Content-Type", "application/json")
      .send('{"access_token": "sample-token", "method": "GET"');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Invalid request body");
    expect(response.body.error.details[0]).toMatchObject({ field: "body", message: "Malformed JSON" });
    expect(response.body).not.toHaveProperty("access_token");
    expect(response.body).not.toHaveProperty("method");
    expect(response.body).not.toHaveProperty("path");
  });
});
