import http from "http";

const server = http.createServer((req, res) => {
    console.log(req.headers['x-forwarded-for']);
    console.log(req.connection.remoteAddress);
    console.log(req.headers['x-forwarded-proto']);
    console.log(req.headers['host']);
    console.log(req.socket.remoteAddress);
    res.end('Hello World\n');
});

server.listen(8080)
