/** Socket.IO instance — mail worker gibi HTTP sonrasi baslayan moduller icin */

let socketIo = null;

function setSocketIo(io) {
  socketIo = io;
}

function getSocketIo() {
  return socketIo;
}

module.exports = { setSocketIo, getSocketIo };
