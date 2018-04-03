
// This sample demonstrates how easy it can be to combine the BotFramework with
// other frameworks. As an example of that we are using Redux to take
// a state-centric view of our bot design.

// In our example, once a conversation has started and messages have been exchanged this bot will
// start to proactively report the current time to the conversation - every 10 seconds!

const botbuilder = require('botbuilder');
const restify = require('restify');
const redux = require('redux');
const createLogger = require('redux-logger').createLogger;
const { default: createSagaMiddleware } = require('redux-saga');
const { call, put, takeEvery, takeLatest } = require('redux-saga/effects');

const conversation = require('./conversation.js');

// Create server
let server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Example redux middleware: lower case the activity text
const lowerCase = store => next => action => {
    if (action.type === 'message') {
        action.activity.text = action.activity.text.toLowerCase();
    }
    return next(action);
}

// Create store
const sagaMiddleware = createSagaMiddleware();
const store = redux.createStore(conversation.store, 
    redux.applyMiddleware(
        // our custom Redux middleware
        lowerCase,
        sagaMiddleware,
        // and a popular piece of Redux middleware from npm
        // createLogger(),
        store => next => action => {
            console.log('----- ACTION -----');
            console.log(action);
            
            return next(action);
        }
));

sagaMiddleware.run(mySaga);

function* mySaga() {
    yield takeLatest("USER_MESSAGE", function* (action) {
        yield put({
            type: 'SEND_ACTIVITY',
            payload: {
                type: 'message',
                text: '((((' + action.payload.request.text + '))))',
                channelId: action.payload.request.channelId,
                serviceUrl: action.payload.request.serviceUrl,
                conversation: action.payload.request.conversation,
                from: { id: 'default-bot', name: 'Bot' },
                recipient: action.payload.request.from,
                replyToId: action.payload.request.id
            }
        });
    });

    yield takeLatest("SEND_ACTIVITY", function* (action) {
        adapter.sendActivity([action.payload]);
    });
}
  
// Create adapter
const adapter = new botbuilder.BotFrameworkAdapter(process.env.MICROSOFT_APP_ID, process.env.MICROSOFT_APP_PASSWORD);
server.post('/api/messages', (req, res) => {
    adapter.processRequest(req, res, (context) => {
        if (context.request.type === 'message') {
            store.dispatch({ type: 'USER_MESSAGE', payload: { request: context.request } });

            // const luisResult = await callLuis(context.request);

            // if (luisResult.name === 'add to cart') {
            // store.dispatch({ type: 'ADD_TO_CART' });
            // }
        }
    });
});

// Redux provides a simple pub-sub model that we can use to help organize our application logic in a decoupled way

// tie the adapter to the store
adapter.onReceive = function (activity) {
    store.dispatch({ type: activity.type, activity: activity });
    return Promise.resolve();
};

// tie the store to the adapter
store.subscribe(() => {
    // const state = store.getState();
    // if (state) {
    //     const last = state[state.length - 1];
    //     if (last && last.bot) {
    //         adapter.post([ last.bot ]);
    //     }
    // }

    console.log('----- STORE -----');
    console.log(store.getState());
});

// and now let's have another source of conversation state change...
setInterval(() => {
    store.dispatch({ type: 'interval', now: new Date() });
}, 5000);

// and, of course, we might have other aspects of our implementation subscribed to the state
