const listeners = {};
let pending = {};
let source = {};
let target = {};
let visitUrl = [];

function notify(url) {
	if(listeners[url] === undefined)
		return;
	const msg = {
		source: source[url] || {},
		target: target[url] || {},
		url: url,
	};
	for(const port of listeners[url])
		port.postMessage(msg);
}

browser.runtime.onConnect.addListener(port => {
	let lastUrl;
	function removeListener() {
		if(!lastUrl)
			return;
		listeners[lastUrl].delete(port);
		if(listeners[lastUrl].size == 0)
			delete listeners[lastUrl];
	}
	port.onDisconnect.addListener(removeListener);
	port.onMessage.addListener(url => {
		removeListener();
		lastUrl = url;
		(listeners[url] ||= new Set()).add(port);
		notify(url);
	});
});

function addVisit(visit) {
	// No-op if this visit was already added
	if(visitUrl[visit.visitId] !== undefined)
		return;
	visitUrl[visit.visitId] = visit.url;

	const todo = pending[visit.visitId] || [];
	delete pending[visit.visitId];

	if(visit.referringVisitId != "-1") {
		if(visitUrl[visit.referringVisitId] === undefined)
			(pending[visit.referringVisitId] ||= []).push(visit);
		else
			todo.push(visit);
	}

	const changed = new Set();
	for(const v of todo) {
		const referrer = visitUrl[v.referringVisitId];
		((source[v.url] ||= {})[referrer] ||= []).push(v.visitTime);
		((target[referrer] ||= {})[v.url] ||= []).push(v.visitTime);
		changed.add(v.url);
		changed.add(referrer);
	}
	for(const url of changed)
		notify(url);
}

function addHistory(item) {
	return browser.history
		.getVisits({url: item.url})
		.then(visits => {
			visits.reverse();
			for(const visit of visits) {
				visit.url = item.url;
				addVisit(visit);
			}
		});
}

browser.history.onVisited.addListener(addHistory);
browser.history.onVisitRemoved.addListener(removed => {
	if(removed.allHistory) {
		pending = {};
		source = {};
		target = {};
		visitUrl = [];
		Object.keys(listeners).forEach(notify);
		return;
	}

	const changed = new Set();
	for(const url of removed.urls) {
		for(const other of Object.keys(target[url] || {})) {
			delete source[other][url];
			changed.add(other);
		}
		for(const other of Object.keys(source[url] || {})) {
			delete target[other][url];
			changed.add(other);
		}
		delete source[url];
		delete target[url];
		changed.add(url);
	}
	for(const url of changed)
		notify(url);
});

browser.history
	.search({
		text: "",
		maxResults: 1000000,
		startTime: 0,
	})
	.then(items => {
		// As an optimization, process the history in roughly
		// chronological order to reduce the number of times a visit is
		// added to `pending` because its referrer hasn't been
		// processed yet.
		items.reverse();
		return Promise.all(items.map(addHistory));
	})
	.then(_ => {
		console.assert(Object.keys(pending).length == 0, pending);
	});
