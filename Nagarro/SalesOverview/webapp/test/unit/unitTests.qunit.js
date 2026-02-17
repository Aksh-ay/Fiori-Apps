/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"zsd_sales_ovw/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
