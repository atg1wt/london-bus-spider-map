/**
 * Client class for REST-ish APIs
 * Requires PHP 7+
 * @project RestThing
 * @author Tyrone C.
 * @version 2022.09.26.01
 * @copyright (C) 2022 by the author
 */

'use strict';

class RestClient {

	constructor(options) {
		this.endpoint = options.endpoint || '';
		this.resourcePrefix = options.resourcePrefix || '';
		this.onError = options.onError || null;
		this.statusMessageManager = options.statusMessageManager || null;
		this.statusMessageTimeout = options.statusMessageTimeout || 2000;
	}

	changeOptions(options) {
		this.endpoint = options.endpoint || this.endpoint;
		this.resourcePrefix = options.resourcePrefix || this.resourcePrefix;
		this.onError = options.onError || this.onError;
		this.statusMessageManager = options.statusMessageManager || this.statusMessageManager;
		this.statusMessageTimeout = options.statusMessageTimeout || this.statusMessageTimeout;
	}

	addPersistentMessage(text) {
		return this.statusMessageManager.add(text);
	}

	removePersistentMessage(uid) {
		this.statusMessageManager.remove(uid);
	}

	// Performs a call to an API and waits for response
	// Returns {isError:xxx, body:xxx, status:xxx, statusText:xxx}
	async request(options) {
		const method = options.method || 'GET';
		let resource = options.resource || '';
		let payload = options.payload || '';
		const progressDone = options.progressDone || 0;
		const progressGoal = options.progressGoal || 0;
		resource = resource.replace(/#/, '%23');
		resource = resource.replace(/\&/, '%26');
		resource = resource.replace(/\+/, '%2B');
		resource = resource.replace(/@/, '%40');
		const url =  `${this.endpoint}${this.resourcePrefix}${resource}`;
		const uploadingFiles = (typeof payload == 'object' && payload.constructor.name == 'FormData');
		const showStatusMessages = options.showStatusMessages || null;
		const statusMessageUid = this.statusMessageManager ? (showStatusMessages || this.statusMessageManager.add(options.message)) : null;
		const timeout = (options.timeout !== undefined) ? options.timeout : 30000; // 30 secs unless specified
		if (payload && !uploadingFiles) {
			payload = JSON.stringify(payload);
		}

		// console.log(`RestThing.callAPI ${message} ${method} ${url}`);

		return new Promise(function (resolve, reject) {
			let asyncReq = new XMLHttpRequest();
			
			asyncReq.onload = function () {
				if (asyncReq.status >= 200 && asyncReq.status <= 299) {
					let returnedPayload;
					try {
						returnedPayload = JSON.parse(asyncReq.response);
					} catch (err) {
						returnedPayload = asyncReq.response;
					}
					if (statusMessageUid && !showStatusMessages) {
						this.statusMessageManager.remove(statusMessageUid);
					}
					resolve({
						isError: false,
						body: returnedPayload,
						status: asyncReq.status,
						statusText: asyncReq.statusText
					});
				} else {
					if (this.statusMessageManager) {
						if (uploadingFiles) {
							this.statusMessageManager.add("HTTP Error " + asyncReq.status, this.statusMessageTimeout);
						} else {
							this.statusMessageManager.modify(statusMessageUid, "HTTP Error " + asyncReq.status, this.statusMessageTimeout);
						}
					}
					if (asyncReq.responseText.includes('<html>')) {
						// For the web server's own errors
						this.handleError(resolve, asyncReq.status, `The web server returned an error with code ${asyncReq.status}:\n\n<b>${asyncReq.statusText}</b>`);
					} else {
						// For the API's errors
						this.handleError(resolve, asyncReq.status, `The server API returned an error with code ${asyncReq.status}:\n\n<b>${asyncReq.responseText}</b>`);
					}
				}
			}.bind(this);
			
			asyncReq.onerror = function () {
				if (this.statusMessageManager) {
					if (uploadingFiles) {
						this.statusMessageManager.add("Error communicating with server", this.statusMessageTimeout);
					} else {
						this.statusMessageManager.modify(statusMessageUid, "Error communicating with server", this.statusMessageTimeout);
					}
				}
				this.handleError(resolve, asyncReq.status, 'Error communicating with server');
			}.bind(this);
			
			asyncReq.ontimeout = function () {
				if (this.statusMessageManager) {
					if (uploadingFiles) {
						this.statusMessageManager.add("Timed out waiting for server", this.statusMessageTimeout);
					} else {
						this.statusMessageManager.modify(statusMessageUid, "Timed out waiting for server", this.statusMessageTimeout);
					}
				}
				this.handleError(resolve, asyncReq.status, 'Timed out waiting for server');
			}.bind(this);
			
			if (uploadingFiles) {
				asyncReq.upload.onprogress = function(evt) {
					if (evt.lengthComputable && this.statusMessageManager) {
						this.statusMessageManager.showProgress(statusMessageUid, (progressDone + evt.loaded) / progressGoal);
					}
				}.bind(this);
			}
			
			asyncReq.timeout = timeout;
			asyncReq.open(method, url);
			asyncReq.send(payload);
		}.bind(this));
	}

	async handleError(resolve, code, msg) {
		if (this.onError) {
			let newMsg = await this.onError(code, msg);
			if (newMsg) msg = newMsg;
		}
		resolve({
			isError: true,
			body: '',
			status: code,
			statusText: msg
		});
	}

}