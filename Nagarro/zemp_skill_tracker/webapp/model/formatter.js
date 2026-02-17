sap.ui.define([
	"sap/ui/core/format/DateFormat"
], function (DateFormat) {
	"use strict";

	return {

		/**
		 * Formats Date into DD.
		 *
		 * @public
		 * @param {Dats} value to be formatted
		 * @returns {Dats} formatted date value with 2 digits
		 */
		formatDate: function (value) {
			if (value) {
                var oDateFormat = DateFormat.getDateTimeInstance({ pattern: "dd.MM.yyyy HH:mm" }); // Example pattern
                return oDateFormat.format(new Date(value));
            }
            return value
		},

		/**
		 * Converts a binary string into an image format suitable for the src attribute
		 *
		 * @public
		 * @param {string} vData a binary string representing the image data
		 * @returns {string} formatted string with image metadata based on the input or a default image when the input is empty
		 */
		handleBinaryContent: function(vData){
			if (vData) {
				var sMetaData1 = 'data:image/jpeg;base64,';
				var sMetaData2 = vData.substr(104); // stripping the first 104 bytes from the binary data when using base64 encoding.
				return sMetaData1 + sMetaData2;
			} else {
				return "../images/Employee.png";
			}
		},

		/**
		 * Provides a text to indicate the delivery status based on shipped and required dates
		 *
		 * @public
		 * @param {object} oRequiredDate required date of the order
		 * @param {object} oShippedDate shipped date of the order
		 * @returns {string} delivery status text from the resource bundle
		 */
		deliveryText: function (oRequiredDate, oShippedDate) {
			var oResourceBundle = this.getModel("i18n").getResourceBundle();

			if (oShippedDate === null) {
				return "None";
			}

			// delivery is urgent (takes more than 7 days)
			if (oRequiredDate - oShippedDate > 0 && oRequiredDate - oShippedDate <= 432000000) {
				return oResourceBundle.getText("formatterDeliveryUrgent");
			} else if (oRequiredDate < oShippedDate) { //d elivery is too late
				return oResourceBundle.getText("formatterDeliveryTooLate");
			} else { // delivery is in time
				return oResourceBundle.getText("formatterDeliveryInTime");
			}
		},

		/**
		 * Provides a semantic state to indicate the delivery status based on shipped and required dates
		 *
		 * @public
		 * @param {object} oRequiredDate required date of the order
		 * @param {object} oShippedDate shipped date of the order
		 * @returns {string} semantic state of the order
		 */
		deliveryState: function (oRequiredDate, oShippedDate) {
			if (oShippedDate === null) {
				return "None";
			}

			// delivery is urgent (takes more than 7 days)
			if (oRequiredDate - oShippedDate > 0 && oRequiredDate - oShippedDate <= 432000000) {
				return "Warning";
			} else if (oRequiredDate < oShippedDate) { // delivery is too late
				return "Error";
			} else { // delivery is in time
				return "Success";
			}
		}
	};
});