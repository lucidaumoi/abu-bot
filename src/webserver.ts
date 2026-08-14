import http from 'node:http';

export function startWebServer(port?: number) {
    const p = process.env.PORT ? Number(process.env.PORT) : port ?? 3000;
    const server = http.createServer((req, res) => {
        if (req.url === '/' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
        }
        // Simple health check path
        if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }
        res.writeHead(404);
        res.end();
    });

    server.listen(p, () => {
        // eslint-disable-next-line no-console
        console.log(`Web server listening on port ${p}`);
    });

    return server;
}

export default startWebServer;
