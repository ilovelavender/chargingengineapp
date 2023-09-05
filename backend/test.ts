import { performance } from "perf_hooks";
import supertest from "supertest";
import { buildApp } from "./app";
import { strict as assert } from 'node:assert';

const app = supertest(buildApp());

async function problemTest() {
    console.log('Start testing problem');
    await app.post("/reset").expect(204);
    await Promise.all([
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
        app.post("/charge").expect(200),
    ]);
    const afterTest = await app.post("/charge").expect(200);
    assert.equal(afterTest.body.isAuthorized, false);
    assert.equal(afterTest.body.remainingBalance, 0);
    assert.equal(afterTest.body.charges, 0);
}

async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start = performance.now();
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    console.log(`Latency: ${performance.now() - start} ms`);
}

async function runTests() {
    await basicLatencyTest();
    await problemTest();
}

runTests().catch(console.error);
