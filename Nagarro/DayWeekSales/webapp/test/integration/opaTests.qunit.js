/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["zsd_sales_week/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
