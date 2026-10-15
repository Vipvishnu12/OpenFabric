import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../src/app";

describe("Auth service API", () => {
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
