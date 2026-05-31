import fs from 'fs';
import path from 'path';

// 1. Update server/index.js
const serverIndexPath = path.resolve('server/index.js');
let serverContent = fs.readFileSync(serverIndexPath, 'utf8').replace(/\r\n/g, '\n');

const oldServer = `      let sepIdx = -1;
      if (colonIdx !== -1 && dashIdx !== -1) {
        sepIdx = Math.min(colonIdx, dashIdx);
      } else {
        sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;
      }`;

const newServer = `      const sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;`;

if (serverContent.includes(oldServer)) {
  serverContent = serverContent.replace(oldServer, newServer);
  fs.writeFileSync(serverIndexPath, serverContent, 'utf8');
  console.log('Successfully updated server/index.js separator logic!');
} else {
  console.log('Warning: could not match oldServer in server/index.js');
}

// 2. Update client/src/App.jsx
const clientAppPath = path.resolve('client/src/App.jsx');
let clientContent = fs.readFileSync(clientAppPath, 'utf8').replace(/\r\n/g, '\n');

const oldClient = `        let sepIdx = -1;
        if (colonIdx !== -1 && dashIdx !== -1) {
          sepIdx = Math.min(colonIdx, dashIdx);
        } else {
          sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;
        }`;

const newClient = `        const sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;`;

if (clientContent.includes(oldClient)) {
  clientContent = clientContent.replace(oldClient, newClient);
  fs.writeFileSync(clientAppPath, clientContent, 'utf8');
  console.log('Successfully updated client/src/App.jsx separator logic!');
} else {
  console.log('Warning: could not match oldClient in client/src/App.jsx');
}
