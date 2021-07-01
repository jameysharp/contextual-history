let windowId;
let activeTab;
const port = browser.runtime.connect();
const title = document.querySelector("#title");
const content = document.querySelector("#content");

function makeList(label, items) {
	const urls = Object.keys(items);
	if(urls.length == 0)
		return document.createTextNode("");

	const outer = document.createElement("p");
	outer.appendChild(document.createTextNode(label));
	const list = document.createElement("ul");
	outer.appendChild(list);

	for(const url of urls) {
		const li = document.createElement("li");
		const a = document.createElement("a");
		a.setAttribute("href", url);
		a.appendChild(document.createTextNode(url));
		li.appendChild(a);

		const visits = items[url];
		let visitLabel = "";
		if(visits.length > 1)
			visitLabel += visits.length + " visits between " +
				new Date(visits[0]) + " and " +
				new Date(visits[visits.length - 1]);
		else
			visitLabel += "on " + new Date(visits[0]);
		a.setAttribute("title", visitLabel);

		list.appendChild(li);
	}

	return outer;
}

port.onMessage.addListener(context => {
	title.textContent = context.url;
	content.textContent = "";
	content.appendChild(makeList("Linked from:", context.source));
	content.appendChild(makeList("Linked to:", context.target));
});

function updateContent(url) {
	// No-op if the URL hasn't changed
	if(title.textContent != url)
		port.postMessage(url);
}

browser.windows.getCurrent({}).then(windowInfo => {
	windowId = windowInfo.id;
	return browser.tabs
		.query({windowId: windowId, active: true})
		.then(tabs => {
			activeTab = tabs[0].id;
			updateContent(tabs[0].url);
		});
});

browser.tabs.onActivated.addListener(activeInfo => {
	if(activeInfo.windowId == windowId) {
		activeTab = activeInfo.tabId;
		browser.tabs
			.get(activeTab)
			.then(tab => updateContent(tab.url));
	}
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if(tabId == activeTab && changeInfo.url !== undefined)
		updateContent(changeInfo.url);
}, {
	properties: ["status", "url"],
	windowId: windowId
});
