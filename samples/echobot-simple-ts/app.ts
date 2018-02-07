import { ConnectorClient, SimpleCredentialProvider, JwtTokenValidation, MicrosoftAppCredentials } from 'botframework-connector';
import { Activity, ActivityTypes } from 'botbuilder-schema';
import * as restify from "restify";

const credentials = new SimpleCredentialProvider('39619a59-5a0c-4f9b-87c5-816c648ff357', 'b90er1BC2xp9Y5Exqwj8qwf');

const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log(`${server.name} listening to ${server.url}`);
});

server.post('/api/messages', getListener());

function getListener(): HttpHandler {
    // handle activity when request body is ready
    function processReq(req, res) {
        console.log('processReq:', req.body);

        let activity = req.body;

        // authenticate request
        let authHeades = req.headers['authorization'] || req.headers['Authorization'] || null;
        JwtTokenValidation.assertValidActivity(activity, authHeades, credentials).then(() => {

            // On message activity, reply with the same text
            if (activity.type === 'message') {
                let reply = createReply(activity, `You said: ${activity.text}`);

                const client = new ConnectorClient(
                    new MicrosoftAppCredentials(credentials.appId, credentials.appPassword),
                    activity.serviceUrl);

                client.conversations.replyToActivity(activity.conversation.id, activity.id, reply)
                    .then((reply) => {
                        console.log('reply send with id: ' + reply.id);
                    });
            }

            res.send(202);
        }).catch(err => {
            console.log('Could not authenticate request:', err);
            res.send(401);
        });
    }

    // support streamed and chuncked responses
    return (req, res) => {
        if (req.body) {
            processReq(req, res);
        } else {
            let requestData = '';
            req.on('data', (chunk: string) => {
                requestData += chunk
            });
            req.on('end', () => {
                req.body = JSON.parse(requestData);
                processReq(req, res);
            });
        }
    };
}

export interface HttpHandler {
    (req, res, next?: Function): void;
}

function createReply(activity: any, text: string, locale: string = null): Activity {
    return {
        type: ActivityTypes.Message,
        timestamp: new Date(),
        from: { id: activity.recipient.id, name: activity.recipient.name },
        recipient: { id: activity.from.id, name: activity.from.name },
        replyToId: activity.id,
        serviceUrl: activity.serviceUrl,
        channelId: activity.channelId,
        conversation: { isGroup: activity.conversation.isGroup, id: activity.conversation.id, name: activity.conversation.name },
        text: text || '',
        locale: locale || activity.locale
    };
}
