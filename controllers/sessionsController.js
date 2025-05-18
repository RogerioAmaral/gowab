import { isSessionExists, createSession, getSession, deleteSession } from './../whatsapp.js'
import response from './../response.js'
import * as fs from 'fs';


const find = (req, res) => {
    response(res, 200, true, 'Session found.')
}

const findorFail = (req, res) => {
    response(res, 200, true, 'Session found.')
}


const status = (req, res) => {
    const session = getSession(res.locals.sessionId);
    
    // Verifica se é uma sessão baseada em banco de dados
    if (session?.useDB) {
      // Sessão baseada em banco de dados
      const states = ['connecting', 'connected', 'disconnecting', 'disconnected'];
      let state = states[session.ws.readyState];
      
      state = state === 'connected' && 
              typeof (session.isLegacy ? session.state.legacy.user : session.user) !== 'undefined'
              ? 'authenticated'
              : state;
      
      // Para sessões DB, obter informações do usuário do objeto session
      const userinfo = session.user || {};
      
      response(res, 200, true, '', { status: state, valid_session: true, userinfo });
    } else {
      // Sessão baseada em arquivo - código original
      fs.readFile(`sessions/md_${res.locals.sessionId}/creds.json`, function(err, data) {
        if(err) {
          const states = ['connecting', 'connected', 'disconnecting', 'disconnected'];
          let state = states[session.ws.readyState];
          
          state = state === 'connected' && 
                  typeof (session.isLegacy ? session.state.legacy.user : session.user) !== 'undefined'
                  ? 'authenticated'
                  : state;
          
          response(res, 403, true, '', { status: state, valid_session: false });
        } else {
          const states = ['connecting', 'connected', 'disconnecting', 'disconnected'];
          let state = states[session.ws.readyState];
          
          state = state === 'connected' && 
                  typeof (session.isLegacy ? session.state.legacy.user : session.user) !== 'undefined'
                  ? 'authenticated'
                  : state;
          
          let rawdata = fs.readFileSync(`sessions/md_${res.locals.sessionId}/creds.json`);
          let userdata = JSON.parse(rawdata);
          
          response(res, 200, true, '', { status: state, valid_session: true, userinfo: userdata.me });
        }
      });
    }
  };

const add = (req, res) => {
    const { id, isLegacy } = req.body

    if (isSessionExists(id)) {
        return response(res, 409, false, 'Session already exists, please use another id.')
    }

    createSession(id, isLegacy === 'true', res)
}

const del = async (req, res) => {
    const { id } = req.params
    const session = getSession(id)

    try {
        await session.logout()
    } catch {
    } finally {
        deleteSession(id, session.isLegacy)
    }

    response(res, 200, true, 'The session has been successfully deleted.')
}



export { find, status, add, del }
