import { getSession, isExists, formatPhone, formatReciver } from './../whatsapp.js'
import response from './../response.js'

//import { getSession } from '../whatsapp.js'

const getMessages = async (req, res) => {
    const session = getSession(res.locals.sessionId)

    /* eslint-disable camelcase */
    const { jid } = req.params
    const { limit = 8, cursor_id = null, cursor_fromMe = null } = req.query

    const cursor = {}

    if (cursor_id) {
        cursor.before = {
            id: cursor_id,
            fromMe: Boolean(cursor_fromMe && cursor_fromMe === 'true'),
        }
    }
    /* eslint-enable camelcase */

    let messages = []

    let existsonwa
    existsonwa = '{"ValidOnWhatsapp": "none", "number": "' + jid + '", "message": error when getting information"'

    let profilestr = ', "profile": {"profile": ""}'
    let statusstr = ', "status": {"status": ""}'
    let ppUrl = ', "profilePictureUrl": ""'

    try {

        const receivernumber = formatReciver(jid)

        let receiver = receivernumber + '@s.whatsapp.net'

        receiver = formatPhone(receiver)

        const exists = await isExists(session, receiver)

        if (!exists) {
            return response(res, 200, true, '{"ValidOnWhatsapp": false, "number": "' + jid + '", "message": "may be INVALID on Whatsapp"}')
            //existsonwa = 'False: The receiver number is not exists: ' + receiver
        } else {
            //return response(res, 200, true, 'chatsController: True: The receiver number exists: ' + receiver)

            existsonwa = '{"ValidOnWhatsapp": true, "number": "' + jid + '", "waid": "' + receivernumber + '", "message": "VALID on Whatsapp"'

            try {

                const profile = await session.getBusinessProfile(receiver)
                //console.log("business description: " + profile.description + ", category: " + profile.category)
                profilestr = JSON.stringify(profile)

                if (profilestr === undefined) {
                    profilestr = ', "profile": {"profile": "particular"}'
                } else {
                    profilestr = ', "profile": ' + profilestr + ''
                }

                const status = '' // await session.fetchStatus(receiver)
                statusstr = '' //JSON.stringify(status)

                //if (statusstr === undefined) {
                //    statusstr = ', "status": {"status": "none"}'
                //} else {
                //    statusstr = ', "status": ' + statusstr + ''
                //}

                ppUrl = await session.profilePictureUrl(receiver, 'image')

                //const ppUrl = await session.profilePictureUrl(receiver, 'image')
                ppUrl = ', "profilePictureUrl": "' + ppUrl + '"'

            } catch {
                // response(res, 200, true, existsonwa + profilestr + statusstr + ppUrl + '}', messages)
                response(res, 200, true, existsonwa + profilestr + statusstr + ppUrl + '}')
            }

        }

        // const useCursor = 'before' in cursor ? cursor : null

        // if (session.isLegacy) {
            // messages = await session.fetchMessagesFromWA(receiver, limit, useCursor)
        // } else {
            // messages = await session.store.loadMessages(receiver, limit, useCursor)
        // }

        // response(res, 200, true, existsonwa + profilestr + statusstr + ppUrl + '}', messages)
        response(res, 200, true, existsonwa + profilestr + statusstr + ppUrl + '}')
    } catch {
        //response(res, 200, false, existsonwa + profilestr + statusstr + ppUrl + '}', messages)
        response(res, 200, false, existsonwa + profilestr + statusstr + ppUrl + '}')
    }
}

export default getMessages
