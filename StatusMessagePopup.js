/**
 * Manages popup status messages in the corner of the screen
 * @version 2022.09.26.01
 * @author Tyrone C.
 * @copyright © 2022 by the author
 * @license MIT
 */

'use strict';

class StatusMessagePopup {

	constructor(options) {
		if (!options) { options = {} };
		this.queue = [];
		this.nextUid = 1;
		if (options.element) {
			this.element = options.element;
		} else {
			this.element = document.createElement('div');
			this.element.classList.add('st_container');
			document.body.appendChild(this.element);
		}
	}

	add(text, timeout) {
		const message = {
			uid: this.nextUid++
		}
		this.queue.push(message);

		const div = document.createElement('div');
		div.classList.add('st_div');
		message.div = div;

		const outerspan = document.createElement('span');
		outerspan.classList.add('st_outerspan');
		message.outerspan = outerspan;

		const innerspan = document.createElement('span');
		innerspan.classList.add('st_innerspan');
		innerspan.innerHTML = text;
		message.innerspan = innerspan;

		outerspan.appendChild(innerspan);
		div.appendChild(outerspan);
		this.element.appendChild(message.div);

		if (timeout) {
			setTimeout( this.remove.bind(this), timeout, message.uid );
		}

		return message.uid;
	}

	modify(uid, text, timeout) {
		const message = this.queue.find(x => x.uid == uid);
		if (message) {
			message.text = text;
			message.innerspan.innerHTML = text;
			if (timeout) {
				setTimeout( this.remove.bind(this), timeout, message.uid );
			}
		}
	}

	remove(uid) {
		const i = this.queue.findIndex(x => x.uid == uid);
		if (i > -1) {
			this.queue[i].div.remove();
			this.queue.splice(i, 1);
		}
	}

	removeAll() {
		for (let i=0; i<this.queue.length; i++) {
			this.remove1(this.queue[i]);
		}
		this.queue = [];
	}

	get length() {
		return this.queue.length;
	}

}

