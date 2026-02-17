/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"zsd_bal_ord_qty/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
