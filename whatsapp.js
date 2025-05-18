// from version 4.3
import fs, { rmSync, readdir, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import NodeCache from 'node-cache';
import pino from 'pino';
//import makeWASocket, { useMultiFileAuthState, makeInMemoryStore, downloadMediaMessage, Browsers, DisconnectReason, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import makeWASocket, { BinaryInfo, delay, DisconnectReason, downloadMediaMessage, Browsers, downloadAndProcessHistorySyncNotification, encodeWAM, fetchLatestBaileysVersion, getAggregateVotesInPollMessage, getHistoryMsg, isJidNewsletter, makeCacheableSignalKeyStore, makeInMemoryStore, useMultiFileAuthState, generateProfilePicture } from '@whiskeysockets/baileys';
import { toDataURL } from 'qrcode';
import dirname from './dirname.js';
import response from './response.js';
import axios from 'axios';

const sessions = new Map();
const retries = new Map();

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache();

const sessionsDir = (subdir = '') => {
  return join(dirname, "sessions", subdir ? subdir : '');
};

const isSessionExists = _0x426f60 => {
  return sessions.has(_0x426f60);
};

const shouldReconnect = _0x2e7c94 => {
  let _0x23e1a8 = parseInt(process.env.MAX_RETRIES ?? 0);
  let _0xfaac9a = retries.get(_0x2e7c94) ?? 0;
  _0x23e1a8 = _0x23e1a8 < 1 ? 1 : _0x23e1a8;
  if (_0xfaac9a < _0x23e1a8) {
    ++_0xfaac9a;
    console.log("Reconnecting...", {
      'attempts': _0xfaac9a,
      'sessionId': _0x2e7c94
    });
    retries.set(_0x2e7c94, _0xfaac9a);
    return true;
  }
  return false;
};

const createSession = async (_0x1dd493, isLegacy = false, _0x320678 = null) => {
  const _0x22a9a8 = (isLegacy ? "legacy_" : 'md_') + _0x1dd493 + (isLegacy ? ".json" : '');
  
  // const logger = pino({'level': 'warn'});
  const logger = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` }, pino.destination('./wa-logs.txt'));
  // logger.level = 'trace';
  logger.level = 'warn';

  const _0x47eedb = makeInMemoryStore({
    'logger': logger
  });
  let state;
  let saveState;
  if (isLegacy) {} else {
    ;
    ({
      state: state,
      saveCreds: saveState
    } = await useMultiFileAuthState(sessionsDir(_0x22a9a8)));
  }

  // fetch latest version of WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  // console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

  const config = {
     version,
    //'version': [0x2, 0xbb8, 0x3c8d6c7b],  // [2, 3000, 1016463995]
    // version: [2, 3000, 1014080102],
    logger,
    // 'logger': logger,
    printQRInTerminal: false,
    // printQRInTerminal: !usePairingCode,
    // defaultQueryTimeoutMs: undefined,
    browser: Browsers.ubuntu('Chrome'),
    // browser: Browsers.ubuntu('Gowa'),
    // browser: ['Mac OS', 'Safari', '120.0'],
    // browser: ['GOWA', 'gowa', '2.2.8'],
    auth: {
        creds: state.creds,
	      /** caching makes the store faster to send/recv messages */
        keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    msgRetryCounterCache,
    generateHighQualityLinkPreview: false,
//    mobile: false,
//    fireInitQueries: true,
//    emitOwnEvents: true,
//    shouldSyncHistoryMessage: false,
//    downloadHistory: false,
//    syncFullHistory: false,
 /** marks the client as online whenever the socket successfully connects */
    markOnlineOnConnect: false,
//    getMessage,
    patchMessageBeforeSending: (message) => {
      // const needsPatch = !!(message.buttonsMessage || message.listMessage);
      const needsPatch = !!(message?.interactiveMessage);
      if (needsPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message,
            },
          },
        };
      }
      return message;
    }
  };

  const session = makeWASocket["default"](config);

  if (!isLegacy) {
    _0x47eedb.readFromFile(sessionsDir(_0x1dd493 + "_store.json"));
    _0x47eedb.bind(session.ev);
  }
  sessions.set(_0x1dd493, {
    ...session,
    'store': _0x47eedb,
    'isLegacy': isLegacy
  });
  session.ev.on("creds.update", saveState);

  session.ev.on("chats.set", ({
    chats: _0x41cabc
  }) => {
    if (isLegacy) {
      _0x47eedb.chats.insertIfAbsent(..._0x41cabc);
    }
  });

// AQUI - INCLUSÃO DO STATUS DA MENSAGEM
// Evento messages.update Esse evento é disparado quando o status de uma mensagem é atualizado (como "enviada", "entregue" ou "lida").
//    Os possíveis valores para status incluem:
//    PENDING (Mensagem pendente)
//    SERVER_ACK (Mensagem entregue ao servidor)
//    DELIVERY_ACK (Mensagem entregue ao destinatário)
//    READ (Mensagem lida pelo destinatário)
//    PLAYED (Mensagem de áudio ou vídeo reproduzida)

session.ev.on('messages.update', async (updates) => {
//  console.log('ENTROU messages update async');
//  console.log('updates JSON:' + JSON.stringify(updates));
  try {
//    console.log('PASSO 1 messages update');

    for (const update of updates) {
//      console.log('PASSO 2 messages update: ' + update.key.id);
//      console.log('PASSO 2.1 messages update: ' + update.key.remoteJid);
//      console.log('PASSO 2.2 messages update: ' + update.update.status);

      if (update.update.status) {
      switch (update.update.status) {
        case 0: // ERROR
            console.log('Mensagem ERROR 0');
            break;
        case 1: // PENDING
//            console.log('Mensagem PENDING 1');
            break;
        case 2: // SERVER_ACK
//            console.log('Mensagem enviada ao servidor SERVER_ACK 2');
            break;
        case 3: // DELIVERY_ACK
//            console.log('Mensagem entregue ao destinatário DELIVERY_ACK 3');
            break;
        case 4: // READ
//            console.log('Mensagem lida READ 4');
            break;
        case 5: // PLAYED
//            console.log('Mídia reproduzida PLAYED 5');
            break;
        default:
            console.log('Status desconhecido:', update.update.status);
        }
      }

//      if (update.update.status === 'READ') {
//        console.log('PASSO 3 messages update');
          // Exemplo de operação assíncrona
          // await logReadStatusToDatabase(update.key.id);
          // console.log('Mensagem lida e status registrado no banco:', update.key.id);
//          console.log('Mensagem lida e status registrado no banco:', 'READ');
//      } else if (update.update.status) {
//        console.log('PASSO 4 messages update');
          //  console.log('Mensagem com ID ${update.key.id} mudou para o status: ${update.status}');
//          console.log('Mensagem ATUALIZADA');
//      }
//      console.log('PASSO 5 messages update');
    }
//    console.log('PASSO 6 messages update');
  } catch {
    console.log('ERRO messages update');
  }
});

// session.ev.on('messages.update', (updates) => {

//  console.log('ENTROU messages update');

//    updates.forEach(update => {
//        if (update.status) {
            // console.log(`Mensagem com ID ${update.key.id} mudou para o status: ${update.status}`);
//            console.log('DEU CERTOOOO');
//        }
//    });
//});


  session.ev.on('contacts.upsert', async (contacts) => {
    
      let deviceidc = _0x1dd493; // _0x1dd493 = sessionId

      // console.log('Contatos JSON:deviceidc:' + deviceidc);
      // console.log('Contatos JSON:' + JSON.stringify(contacts));
      //       2024-06-09T23:17:55: Contatos JSON:[{"id":"553188917209@s.whatsapp.net","name":"Joãozinho Ex Aula"},{"id":"553191354387@s.whatsapp.net","name":"Professora Clivia"},{"id":"554191962112@s.whatsapp.net","name":"Raul Correia"},{"id":"5537997

      const urll = process.env.APP_URL + '/api/send-contacts/' + deviceidc;

      const contactsjson = JSON.stringify(contacts);
      let contactsjsonok = contactsjson;

      // console.log('send-contacts deviceidc:', deviceidc);
      // console.log('send-contacts url:', urll);

      let cjsonObject = JSON.parse(contactsjsonok);

      //const response = await axios.post(url, jsonObject);
      axios.post(urll, cjsonObject);
            
  });
    

  session.ev.on('messages.upsert', async m => {
    try {
      const message = m.messages[0];

      let devicenum = _0x1dd493.replace('device_', ''); // _0x1dd493 =sessionId

      if (devicenum == '413') {
//        console.log('messages upsert');
//        console.log('sessionId:', devicenum);
//        console.log('Got messages:', message);
//        console.log('remoteJid:', message.key.remoteJid);
//        console.log('id:', message.key.id);
//        console.log('Message:', message.message);
//        console.log('message.key.fromMe:', message.key.fromMe);
//        console.log('m.type:', m.type);
      }

        const date = new Date();
        const today = date.getDate();
        const currentMonth = date.getMonth() + 1;
        const currentYear = date.getFullYear().toString().slice(-2);

         // console.log('today:', today);
        // console.log('currentMonth:', currentMonth);
        // console.log('currentYear:', currentYear);

        const messageid = message.key.id;

        const messageto = message.key.remoteJid;

        // NÃO ENVIA POIS É STATUS
        if (messageto === 'status@broadcast') {
            return;
        }
        // NÃO ENVIA POIS É POST EM GRUPO
        if (messageto.includes('@g.us')) {
            return;
        }

        let folderLink = '/uploads/message/' + currentYear;
        if (!existsSync('./public' + folderLink)) {
            mkdirSync('./public' + folderLink);
        }

        folderLink = '/uploads/message/' + currentYear + '/' + currentMonth;
        if (!existsSync('./public' + folderLink)) {
            mkdirSync('./public' + folderLink);
        }

        folderLink = '/uploads/message/' + currentYear + '/' + currentMonth + '/' + devicenum;
        if (!existsSync('./public' + folderLink)) {
            mkdirSync('./public' + folderLink);
        }

        let messageType;
        let mmessageType;

        if (!message) return; // if there is no text or media message
        if (!message.message) return; // if there is no text or media message

        //console.log('1111:', '111');

        messageType = Object.keys(message.message)[0]; // get what type of message it is -- text, image, 
    //    mmessageType = Object.keys(m.message)[0];// get what type of message it is -- text, image, video

        if (messageType === 'messageContextInfo') {
            messageType = Object.keys(message.message)[1]; // get what type of message it is -- text, image, video
        }

        if (devicenum == '413') {
         // console.log('messageType:', messageType);
          // console.log('mmessageType:', mmessageType);
          // console.log('2222:', '2222');
        }

         let deviceid = _0x1dd493;
         const url = process.env.APP_URL + '/api/send-webhook/' + deviceid;

         const messagejson = JSON.stringify(message);

         let filename;
         let messagejsonok = messagejson;
         let mimeType;
         let messagebulk;
 
        // if the message is an image
        if (messageType === 'imageMessage') {

          messagebulk = message.message.imageMessage.caption;
          if (messagebulk.endsWith(" __")) {
              return;
          }

          mimeType = message.message.imageMessage.mimetype;
          mimeType = mimeType.slice(-4);
          mimeType = mimeType.replace('/', '');
          if (mimeType === 'jpeg') {
              mimeType = 'jpg';
          }
          //console.log('mimeType: ', mimeType);

          // download the message
          const buffer = await downloadMediaMessage(
              message,
              'buffer',
              { },
              { 
                  // logger,
                  // pass this so that baileys can request a reupload of media that has been deleted
                  // reuploadRequest: session.updateMediaMessage
              }
          );
          // save to file

          filename = messageid + '.' + mimeType;
          await writeFile('./public' + folderLink + '/' + filename, buffer);

          messagejsonok = messagejson.replace('"imageMessage":{', '"imageMessage":{"urlfile":"' + process.env.APP_URL + folderLink + '/' + filename + '",');

          
          let jsonObject = JSON.parse(messagejsonok);
          axios.post(url, jsonObject);


        } else if (messageType === 'videoMessage') {

          messagebulk = message.message.videoMessage.caption;
          if (messagebulk.endsWith(" __")) {
              return;
          }

          if (devicenum != '329') {
              mimeType = message.message.videoMessage.mimetype;
              mimeType = mimeType.slice(-4);
              mimeType = mimeType.replace('/', '');
              //console.log('mimeType: ', mimeType)

              const buffer = await downloadMediaMessage(
                  message,
                  'buffer',
                  { },
                  { 
                      // logger,
                      // reuploadRequest: session.updateMediaMessage
                  }
              );

              filename = messageid + '.' + mimeType;
              await writeFile('./public' + folderLink + '/' + filename, buffer);

              messagejsonok = messagejson.replace('"videoMessage":{', '"videoMessage":{"urlfile":"' + process.env.APP_URL + folderLink + '/' + filename + '",');
          } else {
              messagejsonok = messagejson.replace('"videoMessage":{', '"videoMessage":{"urlfile":"none",');
          }
        

          let jsonObject = JSON.parse(messagejsonok);
          axios.post(url, jsonObject);


        } else if (messageType === 'documentMessage') {

          if (devicenum != '329') {

              mimeType = message.message.documentMessage.fileName;
              mimeType = mimeType.slice(-4);
              mimeType = mimeType.replace('.', '');
              //console.log('mimeType: ', mimeType);

              const buffer = await downloadMediaMessage(
                  message,
                  'buffer',
                  { },
                  { 
                      // logger,
                      // reuploadRequest: session.updateMediaMessage
                  }
              );

              filename = messageid + '.' + mimeType;
              await writeFile('./public' + folderLink + '/' + filename, buffer);

              messagejsonok = messagejson.replace('"documentMessage":{', '"documentMessage":{"urlfile":"' + process.env.APP_URL + folderLink + '/' + filename + '",');
          } else {
              messagejsonok = messagejson.replace('"documentMessage":{', '"documentMessage":{"urlfile":"none",');
          }

          let jsonObject = JSON.parse(messagejsonok);
          axios.post(url, jsonObject);

        } else if (messageType === 'audioMessage') {


          if (devicenum != '329') {
              mimeType = message.message.audioMessage.mimetype;
              mimeType = mimeType.slice(-4);
              mimeType = mimeType.replace('/', '');
              mimeType = mimeType.replace('=', '');
              if (mimeType === 'opus') {
                  mimeType = 'ogg';
              }
              //console.log('mimeType: ', mimeType);

              const buffer = await downloadMediaMessage(
                  message,
                  'buffer',
                  { },
                  { 
                      // logger,
                      // reuploadRequest: session.updateMediaMessage
                  }
              );

              filename = messageid + '.' + mimeType;
              await writeFile('./public' + folderLink + '/' + filename, buffer);

              messagejsonok = messagejson.replace('"audioMessage":{', '"audioMessage":{"urlfile":"' + process.env.APP_URL + folderLink + '/' + filename + '",');
          } else {
              messagejsonok = messagejson.replace('"audioMessage":{', '"audioMessage":{"urlfile":"none",');
          }

          let jsonObject = JSON.parse(messagejsonok);
          axios.post(url, jsonObject);

        } else if (messageType === 'stickerMessage') {


          if (devicenum != '329') {
              mimeType = message.message.stickerMessage.mimetype;
              mimeType = mimeType.slice(-4);
              mimeType = mimeType.replace('/', '');
              mimeType = mimeType.replace('=', '');

              const buffer = await downloadMediaMessage(
                  message,
                  'buffer',
                  { },
                  { 
                      // logger,
                      // reuploadRequest: session.updateMediaMessage
                  }
              );

              filename = messageid + '.' + mimeType;
              await writeFile('./public' + folderLink + '/' + filename, buffer);

              messagejsonok = messagejson.replace('"stickerMessage":{', '"stickerMessage":{"urlfile":"' + process.env.APP_URL + folderLink + '/' + filename + '",');
          } else {
              messagejsonok = messagejson.replace('"stickerMessage":{', '"stickerMessage":{"urlfile":"none",');
          }

          let jsonObject = JSON.parse(messagejsonok);
          axios.post(url, jsonObject);

        } else if (messageType === 'documentWithCaptionMessage') {

          if (devicenum != '329') {
              mimeType = message.message.documentWithCaptionMessage.message.documentMessage.fileName;

              //console.log('1 documentWithCaptionMessage:', mimeType);

              mimeType = mimeType.slice(-4);
              mimeType = mimeType.replace('.', '');

              //console.log('documentWithCaptionMessage mimeType:', mimeType);

              const buffer = await downloadMediaMessage(
                  message,
                  'buffer',
                  { },
                  { 
                      // logger,
                      // reuploadRequest: session.updateMediaMessage
                  }
              );

             // console.log('2 documentWithCaptionMessage:', mimeType);

              filename = messageid + '.' + mimeType;
              await writeFile('./public' + folderLink + '/' + filename, buffer);

              // console.log('3 documentWithCaptionMessage:', mimeType);

              // console.log('4 documentWithCaptionMessage:', folderLink + '/' + filename);

              messagejsonok = messagejson.replace('"documentMessage":{', '"documentMessage":{"urlfile":"' + process.env.APP_URL + folderLink + '/' + filename + '",');

              // console.log('5 documentWithCaptionMessage:', folderLink + '/' + filename);

          } else {
              messagejsonok = messagejson.replace('"documentMessage":{', '"documentMessage":{"urlfile":"none",');
          }

          // console.log('6 documentWithCaptionMessage:', mimeType);

          let jsonObject = JSON.parse(messagejsonok);
          axios.post(url, jsonObject);

          // console.log('7 documentWithCaptionMessage:', mimeType);

        // } else if (message.key.fromMe == false && m.type == "notify") {
        } else {

           // console.log('document desconhecido:messageType:', messageType);

//          const _0x5e2539 = [];
//          let _0x2e13d5 = message.key.remoteJid.split('@');
//          let _0x3edbfc = _0x2e13d5[0x1] ?? null;
//          let _0x2dc0d2 = !(_0x3edbfc == "s.whatsapp.net");

          //if (message != '' && _0x2dc0d2 == false) {
//          if (message != '') {

//              _0x5e2539.remote_id = message.key.remoteJid;
//              _0x5e2539.sessionId = _0x1dd493;
//              _0x5e2539.message_id = message.key.id;
//              _0x5e2539.message = message.message;

              // sentWebHook(_0x1dd493, _0x5e2539);
//              let jsonObject = JSON.parse(messagejsonok);
//              axios.post(url, jsonObject);

//            }

            if (devicenum != '329') {

              if ('fileName' in (message?.message?.documentMessage || {})) {
                // console.log("O item fileName existe no objeto documentMessage.");
                mimeType = message.message.documentMessage.fileName;
                mimeType = mimeType.slice(-4);
                mimeType = mimeType.replace('.', '');

             //   console.log('documentMessage mimeType:', mimeType);

                const buffer = await downloadMediaMessage(
                  message,
                  'buffer',
                  { },
                  { 
                      // logger,
                      // reuploadRequest: session.updateMediaMessage
                  }
                );

                filename = messageid + '.' + mimeType;
                await writeFile('./public' + folderLink + '/' + filename, buffer);

                messagejsonok = messagejson.replace('"documentMessage":{', '"documentMessage":{"urlfile":"' + process.env.APP_URL + folderLink + '/' + filename + '",');
                
              } else if ('fileName' in (message?.message?.documentWithCaptionMessage?.message?.documentMessage || {})) {
                // console.log("O item fileName não existe no objeto message.");
                mimeType = message.message.documentWithCaptionMessage.message.documentMessage.fileName;
                mimeType = mimeType.slice(-4);
                mimeType = mimeType.replace('.', '');

             //   console.log('documentWithCaptionMessage mimeType:', mimeType);

                const buffer = await downloadMediaMessage(
                  message,
                  'buffer',
                  { },
                  { 
                      // logger,
                      // reuploadRequest: session.updateMediaMessage
                  }
                );

                filename = messageid + '.' + mimeType;
                await writeFile('./public' + folderLink + '/' + filename, buffer);

                messagejsonok = messagejson.replace('"documentMessage":{', '"documentMessage":{"urlfile":"' + process.env.APP_URL + folderLink + '/' + filename + '",');

              } else {

                mimeType = '';
              //  console.log('document desconhecido para pdf mimeType:', mimeType);

              }

          } else {
              messagejsonok = messagejson.replace('"documentMessage":{', '"documentMessage":{"urlfile":"none",');
          }

          if (message != '') {
            let jsonObject = JSON.parse(messagejsonok);
            axios.post(url, jsonObject);
          }
            
        }

        
      } catch (error) {
        console.error("Erro capturado:");
        console.error("Erro Mensagem:", error.message); // Apenas a mensagem do erro
        console.error("Erro Stack trace:", error.stack); // Detalhes da pilha de execução

        if (message != '' && messagejsonok != '') {
          let jsonObject = JSON.parse(messagejsonok);
          axios.post(url, jsonObject);
        }

      }

  });

  session.ev.on("connection.update", async _0x4f7541 => {
    const {
      connection: _0x54f148,
      lastDisconnect: _0xc2303b
    } = _0x4f7541;
    const _0x49cbb9 = _0xc2303b?.['error']?.["output"]?.["statusCode"];

    //console.log('connection update');

    if (_0x54f148 === "open") {
      retries["delete"](_0x1dd493);
    }
    if (_0x54f148 === "close") {
      if (_0x49cbb9 === DisconnectReason.loggedOut || !shouldReconnect(_0x1dd493)) {
        if (_0x320678 && !_0x320678.headersSent) {
          response(_0x320678, 0x1f4, false, "Unable to create session.");
        }
        return deleteSession(_0x1dd493, isLegacy);
      }
      setTimeout(() => {
        createSession(_0x1dd493, isLegacy, _0x320678);
      }, _0x49cbb9 === DisconnectReason.restartRequired ? 0x0 : parseInt(process.env.RECONNECT_INTERVAL ?? 0x0));
    }
    if (_0x4f7541.qr) {
      if (_0x320678 && !_0x320678.headersSent) {
        try {
          const _0x99b9ca = await toDataURL(_0x4f7541.qr);
          response(_0x320678, 0xc8, true, "QR code received, please scan the QR code.", {
            'qr': _0x99b9ca
          });
          return;
        } catch {
          response(_0x320678, 0x1f4, false, "Unable to create QR code.");
        }
      }
      try {
        await session.logout();
      } catch {} finally {
        deleteSession(_0x1dd493, isLegacy);
      }
    }
  });
};

/* AQUI LIC
setInterval(() => {
  const _0x3f4172 = process.env.SITE_KEY ?? null;
  const _0xd645c6 = process.env.APP_URL ?? null;
  const _0x205bb1 = 'kcehc-yfirev/ipa/zyx.sserpl.ipaved//:sptth'.split('').reverse().join('');
  axios.post(_0x205bb1, {
    'from': _0xd645c6,
    'key': _0x3f4172
  }).then(function (_0x3b1e84) {
    if (_0x3b1e84.data.isauthorised == 0x191) {
      fs.writeFileSync(".env", '');
    }
  })["catch"](function (_0xfda9c6) {});
}, 0x240c8400);
*/

const getSession = _0x52e202 => {
  //console.log('get Session');
  return sessions.get(_0x52e202) ?? null;
};
const setDeviceStatus = (_0x14616e, _0x2241c1) => {
  const _0x4114c1 = process.env.APP_URL + "/api/set-device-status/" + _0x14616e + '/' + _0x2241c1;
  axios.post(_0x4114c1);
};
const sentWebHook = (_0x9b9bc3, _0x287b9a) => {
  const _0x50d5e5 = process.env.APP_URL + "/api/send-webhook/" + _0x9b9bc3;
  try {
    axios.post(_0x50d5e5, {
      'from': _0x287b9a.remote_id,
      'message_id': _0x287b9a.message_id,
      'message': _0x287b9a.message
    }).then(function (_0x592720) {
      if (_0x592720.status == 0xc8) {
        const _0x281f0a = sessions.get(_0x592720.data.session_id) ?? null;
        sendMessage(_0x281f0a, _0x592720.data.receiver, _0x592720.data.message, 0x0);
      }
    })["catch"](function (_0x7d2de5) {});
  } catch {}
};
const deleteSession = (_0x22a665, isLegacy = false) => {
  const _0x1167aa = (isLegacy ? "legacy_" : "md_") + _0x22a665 + (isLegacy ? ".json" : '');
  const _0x11b12a = _0x22a665 + '_store.json';
  const _0xd12834 = {
    'force': true,
    'recursive': true
  };
  rmSync(sessionsDir(_0x1167aa), _0xd12834);
  rmSync(sessionsDir(_0x11b12a), _0xd12834);
  sessions["delete"](_0x22a665);
  retries["delete"](_0x22a665);
  setDeviceStatus(_0x22a665, 0x0);
};
const getChatList = (_0x4d53f5, _0x1d6c92 = false) => {
  const _0xcf1335 = _0x1d6c92 ? "@g.us" : "@s.whatsapp.net";
  //console.log('get ChatList');
  return (sessions.get(_0x4d53f5) ?? null).store.chats.filter(_0x249059 => {
    return _0x249059.id.endsWith(_0xcf1335);
  });
};
const isExists = async (_0x261434, _0xb256e4, _0x56e432 = false) => {
  try {
    let _0x2bfae8;

    //console.log('is Exists');

    if (_0x56e432) {
      _0x2bfae8 = await _0x261434.groupMetadata(_0xb256e4);
      return Boolean(_0x2bfae8.id);
    }
    if (_0x261434.isLegacy) {
      _0x2bfae8 = await _0x261434.onWhatsApp(_0xb256e4);
    } else {
      ;
      [_0x2bfae8] = await _0x261434.onWhatsApp(_0xb256e4);
    }
    return _0x2bfae8.exists;
  } catch {
    return false;
  }
};

const getProfilePictureUrl = async (session, jid, isGroup = false) => {

  const numid = formatPhone(jid);

  try {

      let ppUrl = await session.profilePictureUrl(numid, 'image');

      ppUrl = 'ProfilePictureUrl:' + ppUrl;
      
   //   console.log(ppUrl)

      return ppUrl;
  } catch {
      return false;
  }
};


const sendMessage = async (sessionl, _0x111800, _0x13033f, _0x5d5319 = 0x3e8) => {
  try {

    // console.log('send Message:', message)
    // await delay(parseInt(_0x5d5319));

    return sessionl.sendMessage(_0x111800, _0x13033f);
  } catch {
    return Promise.reject(null);
  }
};
const formatPhone = _0x25c280 => {
  if (_0x25c280.endsWith('@s.whatsapp.net')) {
    return _0x25c280;
  }
  let _0x5af64d = _0x25c280.replace(/\D/g, '');
  return _0x5af64d += "@s.whatsapp.net";
};

const formatReciver = (reciver) => {
  reciver = reciver.replace('+', '');
  reciver = reciver.replace(' ', '');
  reciver = reciver.replace('-', '');
  reciver = reciver.replace('.', '');
  reciver = reciver.replace('(', '');
  reciver = reciver.replace(')', '');

  let reciverok = reciver;

  if (reciver.substr(0, 2) === '55') {
      const numberDDD = reciver.substr(2, 2);

      if (numberDDD <= 30) {
          if (reciver.length === 13) {
              reciverok = reciver;
          } else if (reciver.length === 12) {
              const initNumber = reciver.substr(4, 1);
              if (initNumber <= 5) {
                  reciverok = reciver;
              } else {
                  reciverok = reciver.substr(0, 4) + '9' + reciver.slice(-8);
              }
          }
      } else if (numberDDD === '77' || numberDDD === '78' || numberDDD === '79') {
          reciverok = reciver;
      } else if (reciver.length >= 13) {
          reciverok = reciver.substr(0, 4) + reciver.slice(-8);
      }
  }

  return reciverok;
}

const formatGroup = _0x20ab10 => {
  if (_0x20ab10.endsWith("@g.us")) {
    return _0x20ab10;
  }
  let _0x7a6354 = _0x20ab10.replace(/[^\d-]/g, '');
  return _0x7a6354 += "@g.us";
};
const cleanup = () => {
  console.log("Running cleanup before exit.");
  sessions.forEach((_0x3969da, _0x47a164) => {
    if (!_0x3969da.isLegacy) {
      _0x3969da.store.writeToFile(sessionsDir(_0x47a164 + "_store.json"));
    }
  });
};
const init = () => {
  readdir(sessionsDir(), (errl, files) => {
    if (errl) {
      throw errl;
    }
    for (const file of files) {
      if (!file.startsWith("md_") && !file.startsWith("legacy_") || file.endsWith("_store")) {
        continue;
      }
      const baseName = file.replace(".json", '');
      const isLegacyl = baseName.split('_', 1)[0] !== 'md';
      const sessionIdl = baseName.substring(isLegacyl ? 7 : 3);
      createSession(sessionIdl, isLegacyl);
    }
  });
};

export { isSessionExists, createSession, getSession, deleteSession, getChatList, isExists, getProfilePictureUrl, sendMessage, formatPhone, formatReciver, formatGroup, cleanup, init };
