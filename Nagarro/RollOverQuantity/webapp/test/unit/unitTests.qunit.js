/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"zsd_rollovr_qty/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
