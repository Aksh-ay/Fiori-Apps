/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["zempskilltracker/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
