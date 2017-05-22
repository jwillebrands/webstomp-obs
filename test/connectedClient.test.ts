import { expect } from 'chai'
import * as Sinon from 'sinon'
import { ConnectedClient } from '../src/connectedClient'
import WebSocketHandler from '../src/webSocketHandler'
import { Observable } from 'rxjs/Observable'

describe ('Stompobservable connectedClient', () => {
    let client: ConnectedClient
    let mockedWebSocketHandlerSpy

    beforeEach( () => {
        mockedWebSocketHandlerSpy = Sinon.mock()
        client = new ConnectedClient(mockedWebSocketHandlerSpy)
    })

    afterEach( () => {
        mockedWebSocketHandlerSpy.reset()
    })

    describe ('send', () => {

        beforeEach ( () => {
            mockedWebSocketHandlerSpy.send = Sinon.spy()
        })

        afterEach ( () => {
            mockedWebSocketHandlerSpy.send.reset()
        })

        it ('should call webSocketClient.send with the right parameters', () => {
            const expectedDestination = "A destination"
            const expectedBody = "A body"
            client.send(expectedDestination, expectedBody)

            const actualParams = mockedWebSocketHandlerSpy.send.getCall(0).args
            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.send)
            expect(actualParams[0].destination).to.equal(expectedDestination)
            expect(actualParams[1]).to.equal(expectedBody)

        })

        it ('should call webSocketClient.send with the expected header with destination inside', () => {
            const expectedDestination = "A destination"
            const expectedHeaders = Sinon.stub()
            client.send(expectedDestination, "A body", expectedHeaders)

            const actualParams = mockedWebSocketHandlerSpy.send.getCall(0).args
            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.send)
            expect(actualParams[0]).to.eql({...expectedHeaders, 'destination': expectedDestination})

        })
        
    })

    describe ('begin', () => {

        beforeEach ( () => {
            mockedWebSocketHandlerSpy.begin = Sinon.spy()
        })

        afterEach ( () => {
            mockedWebSocketHandlerSpy.begin.reset()
        })

        it ('should call webSocketClient.begin with undefined transaction', () => {
            client.begin()
            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.begin)
            Sinon.assert.calledWith(mockedWebSocketHandlerSpy.begin, undefined)
        })

        it ('should call webSocketClient.begin with the right parameters', () => {
            const expectedTransaction = Sinon.stub()
            client.begin(expectedTransaction)

            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.begin)
            Sinon.assert.calledWith(mockedWebSocketHandlerSpy.begin, expectedTransaction)
        })
    })

    describe ('commit', () => {

        beforeEach ( () => {
            mockedWebSocketHandlerSpy.commit = Sinon.spy()
        })

        afterEach ( () => {
            mockedWebSocketHandlerSpy.commit.reset()
        })

        it ('should call webSocketClient.commit with transaction', () => {
            const expectedTransaction = Sinon.stub()
            client.commit(expectedTransaction)

            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.commit)
            Sinon.assert.calledWith(mockedWebSocketHandlerSpy.commit, expectedTransaction)
        })
    })
    
    describe ('abort', () => {

        beforeEach ( () => {
            mockedWebSocketHandlerSpy.abort = Sinon.spy()
        })

        afterEach ( () => {
            mockedWebSocketHandlerSpy.abort.reset()
        })

        it ('should call webSocketClient.abort with transaction', () => {
            const expectedTransaction = Sinon.stub()
            client.abort(expectedTransaction)

            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.abort)
            Sinon.assert.calledWith(mockedWebSocketHandlerSpy.abort, expectedTransaction)
        })
    })
    
    describe ('ack', () => {

        beforeEach ( () => {
            mockedWebSocketHandlerSpy.ack = Sinon.spy()
        })

        afterEach ( () => {
            mockedWebSocketHandlerSpy.ack.reset()
        })

        it ('should call webSocketClient.ack with transaction', () => {
            const expectedMessageID = "A message Id"
            const expectedSubscription = "A Subscription"
            const expectedHeaders = Sinon.stub()
            client.ack(expectedMessageID, expectedSubscription, expectedHeaders)

            const actualParams = mockedWebSocketHandlerSpy.ack.getCall(0).args
            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.ack)
            Sinon.assert.calledWith(mockedWebSocketHandlerSpy.ack, expectedMessageID, expectedSubscription, expectedHeaders)
        })
    })

    describe ('nack', () => {

        beforeEach ( () => {
            mockedWebSocketHandlerSpy.nack = Sinon.spy()
        })

        afterEach ( () => {
            mockedWebSocketHandlerSpy.nack.reset()
        })

        it ('should call webSocketHandler.nack with transaction', () => {
            const expectedMessageID = "A message Id"
            const expectedSubscription = "A Subscription"
            const expectedHeaders = Sinon.stub()
            client.nack(expectedMessageID, expectedSubscription, expectedHeaders)

            const actualParams = mockedWebSocketHandlerSpy.nack.getCall(0).args
            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.nack)
            Sinon.assert.calledWith(mockedWebSocketHandlerSpy.nack, expectedMessageID, expectedSubscription, expectedHeaders)
        })
    })

    describe ('receipt', () => {

        it ('should give back an observable', () => {
            const actualReceiptObservable = client.receipt()

            expect(actualReceiptObservable).to.exist
            expect(actualReceiptObservable).to.be.instanceof(Observable)
        })

        it ('should not create a new observable', () => {
            const actualReceiptObservable = client.receipt()
            const otherReceiptObservable = client.receipt()

            expect(otherReceiptObservable).to.equal(actualReceiptObservable)
        })

        it ('should give back the frame to the subscribers when webSocketClient.onMessageReceipted is called', (done) => {
            const expectedFrame = Sinon.stub()
            client.receipt().subscribe(
                (frame) => {
                    expect(frame).to.equal(expectedFrame)
                    done()
                },
                (err) => done("unexpected " + err),
                () => done("unexpected")
            )
            mockedWebSocketHandlerSpy.onMessageReceipted()(expectedFrame)
        })

    })

    describe ('error', () => {

        it ('should give back an observable', () => {
            const actualReceiptObservable = client.error()

            expect(actualReceiptObservable).to.exist
            expect(actualReceiptObservable).to.be.instanceof(Observable)
        })

        it ('should not create a new observable', () => {
            const actualReceiptObservable = client.error()
            const otherReceiptObservable = client.error()

            expect(otherReceiptObservable).to.equal(actualReceiptObservable)
        })

        it ('should give back the error to the subscribers when webSocketClient.onErrorReceived is called', (done) => {
            const expectedError = Sinon.stub()
            client.error().subscribe(
                (error) => {
                    expect(error).to.equal(expectedError)
                    done()
                },
                (err) => done("unexpected " + err),
                () => done("unexpected")
            )
            mockedWebSocketHandlerSpy.onErrorReceived()(expectedError)
        })

    })

    describe ('subscribe', () => {

        beforeEach ( () => {
            mockedWebSocketHandlerSpy.subscribe = Sinon.spy()
            mockedWebSocketHandlerSpy.unSubscribe = Sinon.spy()
        })

        afterEach ( () => {
            mockedWebSocketHandlerSpy.subscribe.reset()
            mockedWebSocketHandlerSpy.unSubscribe.reset()
        })

        it ('should give back an observable and call webSocketClient.subscribe with the right parameters', () => {
            const expectedDestination = "A destination"
            const actualReceiptObservable = client.subscribe(expectedDestination)

            expect(actualReceiptObservable).to.exist
            expect(actualReceiptObservable).to.be.instanceof(Observable)
        })

        it ('should give back a unique observable', () => {
            const actualReceiptObservable = client.subscribe("A destination")
            const otherReceiptObservable = client.subscribe("A destination")

            expect(otherReceiptObservable).to.not.equal(actualReceiptObservable)
        })

        it ('should call webSocketClient.subscribe with the right parameters', (done) => {
            const expectedDestination = "A destination"
            client.subscribe(expectedDestination)
                  .subscribe(
                    (frame) => done(frame),
                    (err) => done("unexpected " + err),
                    () => done("unexpected")
                )
            const actualParams = mockedWebSocketHandlerSpy.subscribe.getCall(0).args
            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.subscribe)
            expect(actualParams[0].destination).to.equal(expectedDestination)
            expect(actualParams[0].id).to.equal('sub-0')
            done()
        })

        it ('should call webSocketClient.subscribe twice with the right parameters', (done) => {
            const expectedDestination = "A destination"
            client.subscribe(expectedDestination)
                  .subscribe(
                    (frame) => done(frame),
                    (err) => done("unexpected " + err),
                    () => done("unexpected")
                )
            client.subscribe(expectedDestination)
                  .subscribe(
                    (frame) => done(frame),
                    (err) => done("unexpected " + err),
                    () => done("unexpected")
                )
            Sinon.assert.calledTwice(mockedWebSocketHandlerSpy.subscribe)
            const actualParamsCall1 = mockedWebSocketHandlerSpy.subscribe.getCall(0).args
            expect(actualParamsCall1[0].destination).to.equal(expectedDestination)
            expect(actualParamsCall1[0].id).to.equal('sub-0')
            const actualParamsCall2 = mockedWebSocketHandlerSpy.subscribe.getCall(1).args
            expect(actualParamsCall2[0].destination).to.equal(expectedDestination)
            expect(actualParamsCall2[0].id).to.equal('sub-1')
            done()
        })

        it ('should give back the frame to the subscribers when webSocketClient.onMessageReceived is called', (done) => {
            const expectedDestination = "A destination"
            const expectedFrame = Sinon.stub()
            client.subscribe(expectedDestination)
                  .subscribe(
                    (frame) => {
                        expect(frame).to.equal(expectedFrame)
                        done()
                    },
                    (err) => done("unexpected " + err),
                    () => done("unexpected")
                )
            mockedWebSocketHandlerSpy.onMessageReceived('sub-0')(expectedFrame)
        })

        it ('should not give back the frame to the other subscribers when webSocketClient.onMessageReceived is called', (done) => {
            const expectedDestination = "A destination"
            const expectedFrame = Sinon.stub()
            client.subscribe(expectedDestination)
                  .subscribe(
                    (frame) => {
                        done("shouldn't happen")
                    },
                    (err) => done("unexpected " + err),
                    () => done("unexpected")
                )
            client.subscribe(expectedDestination)
                  .subscribe(
                    (frame) => {
                        expect(frame).to.equal(expectedFrame)
                        done()
                    },
                    (err) => done("unexpected " + err),
                    () => done("unexpected")
                )
            mockedWebSocketHandlerSpy.onMessageReceived('sub-1')(expectedFrame)
        })

        it ('should call webSocketClient.unSubscribe when the last subscriber unsubscribe', (done) => {
            const expectedDestination = "A destination"
            const subscriber = client.subscribe(expectedDestination)
                  .subscribe(
                    (frame) => done(frame),
                    (err) => done("unexpected " + err),
                    () => done("unexpected")
                )
            subscriber.unsubscribe()
            Sinon.assert.calledOnce(mockedWebSocketHandlerSpy.unSubscribe)
            const expectedParams = mockedWebSocketHandlerSpy.subscribe.getCall(0).args
            const actualParams = mockedWebSocketHandlerSpy.unSubscribe.getCall(0).args
            expect(actualParams[0]).to.equal(expectedParams[0])
            done()
        })

    })

    describe ('subscribeBroadcast', () => {

        let subscribeSpy

        beforeEach ( () => {
            subscribeSpy = Sinon.spy(client, 'subscribe')
        })

        afterEach ( () => {
            subscribeSpy.reset()
            subscribeSpy.restore()
        })

        it ('should call connectedClient.subscribe', () => {
            const expectedDestination = "A destination"
            client.subscribeBroadcast(expectedDestination)
            Sinon.assert.calledOnce(subscribeSpy)
            const actualParams = subscribeSpy.getCall(0).args
            expect(actualParams[0]).to.equal(expectedDestination)
        })
        
        it ('should call once connectedClient.subscribe', () => {
            const expectedDestination = "A destination"
            const subscribe1 = client.subscribeBroadcast(expectedDestination)
            const subscribe2 = client.subscribeBroadcast(expectedDestination)
            Sinon.assert.calledOnce(subscribeSpy)
            expect(subscribe1).to.equal(subscribe2)
        })

        it ('should call once connectedClient.subscribe per destination', () => {
            const expectedDestination1 = "A destination"
            const expectedDestination2 = "Another destination"
            const subscribe1 = client.subscribeBroadcast(expectedDestination1)
            const subscribe2 = client.subscribeBroadcast(expectedDestination2)
            Sinon.assert.calledTwice(subscribeSpy)
            expect(subscribe1).to.not.equal(subscribe2)
            const actualParams1 = subscribeSpy.getCall(0).args
            expect(actualParams1[0]).to.equal(expectedDestination1)
            const actualParams2 = subscribeSpy.getCall(1).args
            expect(actualParams2[0]).to.equal(expectedDestination2)
        })

    })

});