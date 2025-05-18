import { getSession, getChatList, isExists, getProfilePictureUrl, sendMessage, formatPhone } from './../whatsapp.js'
import response from './../response.js'

const getList = (req, res) => {
    return response(res, 200, true, 'getList', getChatList(res.locals.sessionId))
}

const send = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const receiver = formatPhone(req.body.receiver)
    const delay = req.body.delay
    const { message } = req.body

    try {
        const exists = await isExists(session, receiver)

        if (!exists) {
            return response(res, 400, false, 'The receiver number does not exist on WhatsApp')
        }

        await sendMessage(session, receiver, message, delay)

        response(res, 200, true, 'The message has been successfully sent.')
    } catch {
        response(res, 500, false, 'Failed to send the message.')
    }
}

const iswhats = async (req, res) => {
    const session = getSession(res.locals.sessionId)

    const str = req.body.receiver
    let receiver = ''
    let getpic = ''

    if (str[0] === 'p') {
        const strreceiver = str.slice(1)
        receiver = formatPhone(strreceiver)
        getpic = 'getpic'

    } else {
        receiver = formatPhone(req.body.receiver)
    }


    try {
        const exists = await isExists(session, receiver)

        if (!exists) {
            return response(res, 200, true, 'The receiver number does not exist on WhatsApp: ' + receiver)
        } else {

            if (getpic == 'getpic') {

                const ppurl = await getProfilePictureUrl(session, receiver)

                if (!ppurl) {
                    return response(res, 200, true, 'The receiver number does not Profile Picture WhatsApp: ' + receiver)
                } else {
                    return response(res, 200, true, ppurl)
                }

            } else {
                return response(res, 200, true, 'The receiver number exists on WhatsApp: ' + receiver)
            }
        }

    } catch {
        response(res, 500, false, 'Failed to verify receiver number.')
    }

}


const sendBulk = async (req, res) => {
    const session = getSession(res.locals.sessionId)
    const errors = []

    for (const [key, data] of req.body.entries()) {
        let { receiver, message, delay } = data

        if (!receiver || !message) {
            errors.push(key)

            continue
        }

        if (!delay || isNaN(delay)) {
            delay = 1000
        }

        receiver = formatPhone(receiver)

        try {
            const exists = await isExists(session, receiver)

            if (!exists) {
                errors.push(key)

                continue
            }

            await sendMessage(session, receiver, message, delay)
        } catch {
            errors.push(key)
        }
    }

    if (errors.length === 0) {
        return response(res, 200, true, 'All messages has been successfully sent.')
    }

    const isAllFailed = errors.length === req.body.length

    response(
        res,
        isAllFailed ? 500 : 200,
        !isAllFailed,
        isAllFailed ? 'Failed to send all messages.' : 'Some messages has been successfully sent.',
        { errors }
    )
}

export { getList, send, sendBulk, iswhats }
