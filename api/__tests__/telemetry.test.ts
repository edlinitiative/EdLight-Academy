import handler from '../telemetry';

function request(body: unknown, headers = {}, method = 'POST') {
  const req = { method, headers: { 'content-type': 'application/json', ...headers }, body, socket: { remoteAddress: 'test' } };
  const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  return { req: req as any, res: res as any };
}
const valid = { events: [{ type: 'error', name: 'handled_error', timestamp: 10,
  error: { name: 'TypeError', message: 'private' }, detail: { flow: 'exam', answer: 'private' },
  context: { platform: 'android', updateId: 'u1', buildNumber: '42' } }] };

it('logs sanitized diagnostics with build context and acknowledges delivery', async () => {
  const log = jest.spyOn(console, 'info').mockImplementation(() => {});
  const { req, res } = request(valid);
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(202);
  const saved = JSON.parse(log.mock.calls[0][0]);
  expect(saved.service).toBe('student_diagnostics');
  expect(saved.event.context).toEqual(valid.events[0].context);
  expect(saved.event.detail).toEqual({ flow: 'exam' });
  expect(JSON.stringify(saved)).not.toContain('private');
  log.mockRestore();
});

it.each([
  [null, {}, 'GET', 405],
  [valid, { origin: 'https://untrusted.example' }, 'POST', 403],
  [valid, { 'content-type': 'text/plain' }, 'POST', 415],
  ['{invalid', {}, 'POST', 400],
  [{ events: [] }, {}, 'POST', 400],
  [{ events: Array(21).fill(valid.events[0]) }, {}, 'POST', 400],
  [{ events: [{}] }, {}, 'POST', 400],
  ['a'.repeat(64_001), {}, 'POST', 413],
])('rejects invalid requests without logging their body %#', async (body, headers, method, status) => {
  const log = jest.spyOn(console, 'info').mockImplementation(() => {});
  const { req, res } = request(body, headers as Record<string, string>, method as string);
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(status);
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});

it('bounds bursts, including native requests without an Origin', async () => {
  const log = jest.spyOn(console, 'info').mockImplementation(() => {});
  const { req, res } = request(valid, { 'x-forwarded-for': 'rate-limit-test' });
  for (let i = 0; i < 121; i++) await handler(req, res);
  expect(log).toHaveBeenCalledTimes(120);
  expect(res.status).toHaveBeenLastCalledWith(429);
  expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  log.mockRestore();
});

it('accepts the canonical web origin and the current preview deployment only', async () => {
  const previous = process.env.VERCEL_URL;
  process.env.VERCEL_URL = 'current-preview.vercel.app';
  const log = jest.spyOn(console, 'info').mockImplementation(() => {});
  try {
    for (const origin of ['https://academy.edlight.org', 'https://current-preview.vercel.app']) {
      const { req, res } = request(valid, { origin });
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    }
    const { req, res } = request(valid, { origin: 'https://another-project.vercel.app' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previous;
    log.mockRestore();
  }
});
