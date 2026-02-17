/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["zbalancepaymentdetails/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
