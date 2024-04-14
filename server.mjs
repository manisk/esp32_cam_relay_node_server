import path, { dirname } from 'path';
import express from 'express';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config()

const app = express();

app.use("/static", express.static(path.join(__dirname, "public")));

let clients = [];

const HTTP_PORT = process.env.HTTP_PORT;
let devices = {
  cam1: { port: process.env.CAM_SOCKET_PORT1 },
};

process.on("uncaughtException", (error, origin) => {
  console.log("----- Uncaught exception -----");
  console.log(error);
  console.log("----- Exception origin -----");
  console.log(origin);
  console.log("----- Status -----");
});

// Clients
const ws = new WebSocketServer({ port: process.env.CLIENT_SOCKET_PORT }, () => {
  console.log(`WS Server is listening at 8999`);
});

ws.on("connection", (ws, request) => {
  console.log("connection request recieved for port " + process.env.CLIENT_SOCKET_PORT + " at " + new Date());
  ws.on('error', console.error);
  ws.on("message", (data) => {
    if (ws.readyState !== ws.OPEN) return;
    clients.push(ws);

    try {
      data = JSON.parse(data);

      if (data.operation === "command") {
        if (devices[data.command.recipient]) {
          devices[data.command.recipient].command =
            data.command.message.key + "=" + data.command.message.value;
        }
      }
    } catch (error) { }
  });
});

// Devices
Object.entries(devices).forEach(([key]) => {
  const device = devices[key];
  new WebSocketServer({ port: device.port }, () =>
    console.log(`WS Server is listening at ${device.port}`)
  ).on("connection", (ws) => {
    console.log("connection request recieved: " + ws);
    ws.on("message", (data) => {
      if (ws.readyState !== ws.OPEN) return;
      if (device.command) {
        ws.send(device.command);
        device.command = null; // Consume
      }

      if (typeof data === "object") {
        device.image = Buffer.from(Uint8Array.from(data)).toString("base64");
      } else {
        device.peripherals = data.split(",").reduce((acc, item) => {
          const key = item.split("=")[0];
          const value = item.split("=")[1];
          acc[key] = value;
          return acc;
        }, {});
      }

      clients.forEach((client) => {
        client.send(JSON.stringify({ devices: devices }));
      });
    });
  });
});

app.get("/client", (_req, res) => {
  const filePath = path.resolve(__dirname, "./public/client.html");
  const file = fs.readFileSync(filePath, 'utf8')
    .replace("{{host_name}}", process.env.HOST_NAME)
    .replace("{{client_socket_port}}", process.env.CLIENT_SOCKET_PORT)
    .replace("{{web_socket_protocol}}", process.env.WEBSOCKET_PROTOCOL);
  res.send(file);
});

app.listen(HTTP_PORT, () => {
  console.log(`HTTP server starting on ${HTTP_PORT}`);
});


function basicAuth(req, res, next) {
  const auth = { login: process.env.UNAME, password: process.env.PWD } // change this
  // parse login and password from headers
  const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')

  // Verify login and password are set and correct
  if (login && password && login === auth.login && password === auth.password) {
    // Access granted...
    return next()
  }

  // Access denied...
  res.set('WWW-Authenticate', 'Basic realm="401"') // change this
  res.status(401).send('Authentication required.') // custom message
  // -----------------------------------------------------------------------
}