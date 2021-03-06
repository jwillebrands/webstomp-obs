import { Observable } from 'rxjs/Observable';
import { Observer } from 'rxjs/Observer';

import Frame from './frame';
import { IWebSocket } from './client';
import { AckHeaders, NackHeaders,
         ConnectedHeaders, ConnectionHeaders, DisconnectHeaders,
         SubscribeHeaders, UnsubscribeHeaders } from './headers';
import { VERSIONS, BYTES, typedArrayToUnicodeString, unicodeStringToTypedArray } from './utils';
import Heartbeat, { HeartbeatOptions } from './heartbeat';


export interface Subscription {
    id: string;
    unsubscribe: () => void;
}

export interface IEvent {
    data: any
}

export interface WsOptions {
    binary: boolean;
    heartbeat: HeartbeatOptions | boolean;
    debug: boolean;

}

// STOMP Client Class
//
// All STOMP protocol is exposed as methods of this class ('connect()',
// 'send()', etc.)
class WebSocketHandler {

    private ws: IWebSocket
    private isBinary: boolean
    private hasDebug: boolean
    private counter: number
    private connected: boolean
    private maxWebSocketFrameSize: number
    private partialData: string
    private createWS: Function

    private version: any

    private heartbeatSettings: HeartbeatOptions
    private heartbeat: Heartbeat

    public onMessageReceived: (subscription: string) => (Frame) => void
    public onMessageReceipted: () => (Frame) => void
    public onErrorReceived: () => (Frame) => void
    public onConnectionError: () => (ev: CloseEvent) => void

    constructor(createWsConnection: () => IWebSocket, options: WsOptions) {

        // cannot have default options object + destructuring in the same time in method signature
        let {binary = false, debug = false, heartbeat = {outgoing: 10000, incoming: 10000}} = options;
        this.hasDebug = !!debug;
        this.connected = false;
        // Heartbeat properties of the client
        // outgoing: send heartbeat every 10s by default (value is in ms)
        // incoming: expect to receive server heartbeat at least every 10s by default
        // falsy value means no heartbeat hence 0,0
        this.heartbeatSettings = (heartbeat as HeartbeatOptions) || {outgoing: 0, incoming: 0};
        this.heartbeat = new Heartbeat(this.heartbeatSettings, this._debug);

        this.partialData = '';
        this.createWS = createWsConnection;

        this.isBinary = !!binary;
        // used to index subscribers
        this.counter = 0;
        // maximum *IWebSocket* frame size sent by the client. If the STOMP frame
        // is bigger than this value, the STOMP frame will be sent using multiple
        // IWebSocket frames (default is 16KiB)
        this.maxWebSocketFrameSize = 16 * 1024;

    }

    public initConnection = (headers: ConnectionHeaders,
                    onDisconnect: (ev: any) => void
                    ): Observable<void> => {

        return Observable.create((observer: Observer<void>) => {
            if (this.ws) {
                throw 'Error, the connection has already been created !'
            }
            this.ws = this.createWS();
            if (!this.ws) {
                throw 'Error, createWsConnection function returned null !'
            }
            this.ws.binaryType = 'arraybuffer';

            this._debug('Opening Web Socket...');
            this.ws.onmessage = (evt: IEvent) => {
                let data = evt.data;
                if (evt.data instanceof ArrayBuffer) {
                    data = typedArrayToUnicodeString(new Uint8Array(evt.data));
                }
                this.heartbeat.activityFromServer();
                // heartbeat
                if (data === BYTES.LF) {
                    this._debug(`<<< PONG`);
                    return;
                }
                this._debug(`<<< ${data}`);
                // Handle STOMP frames received from the server
                // The unmarshall function returns the frames parsed and any remaining
                // data from partial frames.
                const unmarshalledData = Frame.unmarshall(this.partialData + data);
                this.partialData = unmarshalledData.partial;
                unmarshalledData.frames.forEach((frame: Frame) => {
                    switch (frame.command) {
                        // [CONNECTED Frame](http://stomp.github.com/stomp-specification-1.1.html#CONNECTED_Frame)
                        case 'CONNECTED':
                            this._debug(`connected to server ${frame.headers.server}`);
                            this.connected = true;
                            this.version = frame.headers.version;
                            observer.next(null);
                            this._setupHeartbeat(this.ws, frame.headers);
                            break;
                        // [MESSAGE Frame](http://stomp.github.com/stomp-specification-1.1.html#MESSAGE)
                        case 'MESSAGE':
                            // the 'onreceive' callback is registered when the client calls
                            // 'subscribe()'.
                            // If there is registered subscription for the received message,
                            // we used the default 'onreceive' method that the client can set.
                            // This is useful for subscriptions that are automatically created
                            // on the browser side (e.g. [RabbitMQ's temporary
                            // queues](http://www.rabbitmq.com/stomp.html)).
                            const subscription: string = frame.headers.subscription;

                            const onreceive: Function = this.onMessageReceived && this.onMessageReceived(subscription);
                            if (onreceive) {
                                // 1.2 define ack header if ack is set to client
                                // and this header must be used for ack/nack
                                const messageID: string = this.version === VERSIONS.V1_2 &&
                                    frame.headers.ack ||
                                    frame.headers['message-id'];
                                // add 'ack()' and 'nack()' methods directly to the returned frame
                                // so that a simple call to 'message.ack()' can acknowledge the message.
                                frame.ack = this.ack.bind(this, messageID, subscription);
                                frame.nack = this.nack.bind(this, messageID, subscription);
                                onreceive(frame);
                            } else {
                                this._debug(`Unhandled received MESSAGE: ${frame}`);
                            }

                            break;
                        // [RECEIPT Frame](http://stomp.github.com/stomp-specification-1.1.html#RECEIPT)
                        //
                        // The client instance can set its 'onreceipt' field to a function taking
                        // a frame argument that will be called when a receipt is received from
                        // the server:
                        //
                        //     client.onreceipt = function(frame) {
                        //       receiptID = frame.headers['receipt-id'];
                        //       ...
                        //     }
                        case 'RECEIPT':
                            if (this.onMessageReceipted) this.onMessageReceipted()(frame);
                            break;
                        // [ERROR Frame](http://stomp.github.com/stomp-specification-1.1.html#ERROR)
                        case 'ERROR':
                            if(this.onErrorReceived) this.onErrorReceived()(frame)
                            break;
                        default:
                            this._debug(`Unhandled frame: ${frame}`);
                    }
                });
            };
            this.ws.onclose = (ev: CloseEvent) => {
                this._debug(`Whoops! Lost connection to ${this.ws.url}:`, ev);
                this.heartbeat.stopHeartbeat();
                this.ws = null;
                this.onConnectionError && this.onConnectionError()(ev);
                onDisconnect (ev);
            };
            this.ws.onopen = () => {
                this._debug('Web Socket Opened...');
                headers['accept-version'] = VERSIONS.supportedVersions();
                // Check if we already have heart-beat in headers before adding them
                if (!headers['heart-beat']) {
                    headers['heart-beat'] = [this.heartbeatSettings.outgoing, this.heartbeatSettings.incoming].join(',');
                }
                this._transmit('CONNECT', headers);
            };

            return () => {
                this.disconnect(headers)
            }

        })

    }

    // Heart-beat negotiation
    private _setupHeartbeat = (ws: IWebSocket, headers: ConnectedHeaders) => {
        const send = (data: any) => this._wsSend(ws, data);
        this.heartbeat.startHeartbeat(headers,
                                      { send, close: ws.close});
    }

    // [DISCONNECT Frame](http://stomp.github.com/stomp-specification-1.1.html#DISCONNECT)
    public disconnect = (headers: DisconnectHeaders = {}) => {
        this.heartbeat.stopHeartbeat();
        this.connected = false;
        if (this.ws) {
            this.ws.onclose = null;
            this._transmit('DISCONNECT', headers);
            this.ws.close();
            this.ws = null;
        }
    }

    // [SEND Frame](http://stomp.github.com/stomp-specification-1.1.html#SEND)
    //
    // * 'destination' is MANDATORY.
    public send = (headers: any = {}, body: any = '') => {
        this._transmit('SEND', headers, body);
    }

    // [BEGIN Frame](http://stomp.github.com/stomp-specification-1.1.html#BEGIN)
    //
    // If no transaction ID is passed, one will be created automatically
    public begin = (transaction: any = `tx-${this.counter++}`) => {
        this._transmit('BEGIN', {transaction});
        return {
            id: transaction,
            commit: this.commit.bind(this, transaction),
            abort: this.abort.bind(this, transaction)
        };
    }

    // [COMMIT Frame](http://stomp.github.com/stomp-specification-1.1.html#COMMIT)
    //
    // * 'transaction' is MANDATORY.
    //
    // It is preferable to commit a transaction by calling 'commit()' directly on
    // the object returned by 'client.begin()':
    //
    //     var tx = client.begin(txid);
    //     ...
    //     tx.commit();
    public commit = (transaction: string) => {
        this._transmit('COMMIT', {transaction});
    }

    // [ABORT Frame](http://stomp.github.com/stomp-specification-1.1.html#ABORT)
    //
    // * 'transaction' is MANDATORY.
    //
    // It is preferable to abort a transaction by calling 'abort()' directly on
    // the object returned by 'client.begin()':
    //
    //     var tx = client.begin(txid);
    //     ...
    //     tx.abort();
    public abort = (transaction: string) => {
        this._transmit('ABORT', {transaction});
    }

    // [ACK Frame](http://stomp.github.com/stomp-specification-1.1.html#ACK)
    //
    // * 'messageID' & 'subscription' are MANDATORY.
    //
    // It is preferable to acknowledge a message by calling 'ack()' directly
    // on the message handled by a subscription callback:
    //
    //     client.subscribe(destination,
    //       function(message) {
    //         // process the message
    //         // acknowledge it
    //         message.ack();
    //       },
    //       {'ack': 'client'}
    //     );
    public ack = (messageID: string, subscription: string, headers?: AckHeaders) => {
        const currentHeader: any = {...headers}
        currentHeader[this._getIdAttr()] = messageID;
        currentHeader.subscription = subscription;
        this._transmit('ACK', currentHeader);
    }

    // [NACK Frame](http://stomp.github.com/stomp-specification-1.1.html#NACK)
    //
    // * 'messageID' & 'subscription' are MANDATORY.
    //
    // It is preferable to nack a message by calling 'nack()' directly on the
    // message handled by a subscription callback:
    //
    //     client.subscribe(destination,
    //       function(message) {
    //         // process the message
    //         // an error occurs, nack it
    //         message.nack();
    //       },
    //       {'ack': 'client'}
    //     );
    public nack = (messageID: string, subscription: string, headers?: NackHeaders) => {
        const currentHeader: any = {...headers}
        currentHeader[this._getIdAttr()] = messageID;
        currentHeader.subscription = subscription;
        this._transmit('NACK', currentHeader);
    }

    private _getIdAttr = (): string => {
        return this.version === VERSIONS.V1_2 ? 'id' : 'message-id';
    }

    // [SUBSCRIBE Frame](http://stomp.github.com/stomp-specification-1.1.html#SUBSCRIBE)
    public subscribe = ( headers: SubscribeHeaders) => {
        this._transmit('SUBSCRIBE', headers);
        return {
            id: headers.id,
            unsubscribe: this.unSubscribe.bind(this, headers.id)
        };
    }

    // [UNSUBSCRIBE Frame](http://stomp.github.com/stomp-specification-1.1.html#UNSUBSCRIBE)
    //
    // * 'id' is MANDATORY.
    //
    // It is preferable to unsubscribe from a subscription by calling
    // 'unsubscribe()' directly on the object returned by 'client.subscribe()':
    //
    //     var subscription = client.subscribe(destination, onmessage);
    //     ...
    //     subscription.unsubscribe(headers);
    public unSubscribe = (headers: UnsubscribeHeaders) => {
        this._transmit('UNSUBSCRIBE', headers);
    }

    // Base method to transmit any stomp frame
    private _transmit = (command: string, headers?: any, body?: any) => {
        if (!this.ws) {
            throw 'Error, this.ws is null ! Possibly initConnection has not been called or not subscribed !';
        }
        let out = Frame.marshall(command, headers, body);
        this._debug(`>>> ${out}`);
        this._wsSend(this.ws, out);
    }

    private _wsSend = (ws: IWebSocket, data: any) => {
        if (this.isBinary) data = unicodeStringToTypedArray(data);
        this._debug(`>>> length ${data.length}`);
        // if necessary, split the *STOMP* frame to send it on many smaller
        // *IWebSocket* frames
        while (true) {
            if (data.length > this.maxWebSocketFrameSize) {
                ws.send(data.slice(0, this.maxWebSocketFrameSize));
                data = data.slice(this.maxWebSocketFrameSize);
                this._debug(`remaining = ${data.length}`);
            } else {
                return ws.send(data);
            }
        }
    }

    // //// Debugging
    //
    // By default, debug messages are logged in the window's console if it is defined.
    // This method is called for every actual transmission of the STOMP frames over the
    // IWebSocket.
    //
    // It is possible to set a 'this._debug(message)' method
    // on a client instance to handle differently the debug messages:
    //
    //     client.debug = function(str) {
    //         // append the debug log to a #debug div
    //         $("#debug").append(str + "\n");
    //     };
    private _debug = (message: any, ...args: any[]) => {
        if (this.hasDebug) console.log(message, ...args);
    }

}

export default WebSocketHandler;
