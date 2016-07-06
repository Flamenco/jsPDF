// These modes are defined in the PDF specification
var pdfBlendModes = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'ColorDodge', 'ColorBurn',
    'HardLight', 'SoftLight', 'Difference', 'Exclusion', 'Hue', 'Saturation', 'Color', 'Luminosity'];

/**
 * Call this function on your PDF to enable support
 * @param pdf
 */
function addTransparencyGroupSupport(pdf) {

    //
    // Groups
    //

    /**
     * A stack of transparency groups
     */
    pdf.internal.groupStack = [];

    /**
     * All created groups
     */
    pdf.internal.groups = [];
    pdf.groups = pdf.internal.groups;

    /**
     * Creates a new transparency group.
     * All following drawing operations will be written to the group's stream
     * @param options The name of the group or an options object.  If not defined, a name will be generated.
     * options: name, isolation (isolation), knockout (knockout), isMask
     * @returns The new group object
     */
    pdf.pushGroup = function (options) {
        if (!options) {
            options = {};
        }
        else if (typeof options === 'string') {
            options = {name: options};
        }
        options.knockout = options.knockout;
        if (typeof options.knockout === 'undefined') {
            options.knockout = true;
        }
        var strKnockout = options.knockout ? 'true' : 'false';

        options.isolated = options.isolated;
        if (typeof options.isolated === 'undefined') {
            options.isolated = true;
        }
        var strIsolated = options.isolated ? 'true' : 'false';

        // define a mask state
        var objGroup = this.internal.newObject2();
        objGroup.type = 'group';
        objGroup.name = options.name || 'GROUP' + objGroup.objId;
        objGroup.stream = [];
        //TODO use actual size

        //TODO the pushed group method should specify bounds
        var pageInfo = pdf.internal.getPageInfo(1);
        var wPt = (pageInfo.pagedim.width) * pageInfo.scaleFactor;
        var hPt = (pageInfo.pagedim.height) * pageInfo.scaleFactor;
        var dictionary = '<< /Type/XObject /Subtype/Form /FormType 1 /BBox [ 0 0 ' + pdf.internal.f2(wPt) + ' ' + pdf.internal.f2(hPt) + ']';
        if (!options.isMask) {
            dictionary += ' /Group <</S /Transparency /CS /DeviceRGB /I ' + strIsolated + ' /K ' + strKnockout + '>>';
        }
        dictionary += '>>';

        objGroup.push(dictionary);
        this.internal.groupStack.push(objGroup);
        this.internal.groups.push(objGroup);
        window.outIntercept = objGroup.stream;
        return objGroup;
    };

    /**
     * Restores the previous transparency group
     * @returns The group that was removed
     */
    pdf.popGroup = function () {
        var ret = this.internal.groupStack.pop();
        if (this.internal.groupStack.length == 0) {
            window.outIntercept = null;
        } else {
            window.outIntercept = this.internal.groupStack[this.internal.groupStack.length - 1];
        }
        return ret;
    };

    /**
     * Draws the specified group onto the current group or page
     * @param groupOrName The group object, or the name of the group
     */
    pdf.drawGroup = function (groupOrName) {
        var groupName;
        if (typeof groupOrName === 'string') {
            groupName = groupOrName;
        } else {
            groupName = groupOrName.name;
        }

        var ctx = this.canvas.getContext('2d');
        var globalCompositeOperation = ctx.globalCompositeOperation;
        if (!globalCompositeOperation) {
            globalCompositeOperation = 'source-over';
        }
        switch (globalCompositeOperation) {
            case 'destination-in':
                // define a mask stream
                //var objMask = this.internal.newStreamObject();
                //var outInterceptOld = window.outIntercept;
                //window.outIntercept = objMask;
                //this.internal.out('/' + groupName + ' Do');
                //window.outIntercept = outInterceptOld;

                // define a mask state
                var objGState = this.internal.newObject2();
                objGState.push('<</Type /ExtGState');
                objGState.push('/SMask <</S /Alpha /G ' + groupOrName.objId + ' 0 R>>'); // /S /Luminosity attribute will need to define color space
                objGState.push('>>');
                // add mask to page resources
                var gstateName = 'MASK' + objGState.objId;
                this.internal.addGraphicsState(gstateName, objGState.objId);

                // add mask to page, group, or stream
                //this.internal.out('q');
                //BUG must be before other drawing ops
                if (window.outIntercept) {
                    window.outIntercept.stream.splice(0, 0, '/' + gstateName + ' gs');
                } else {
                    this.internal.pages[1].splice(0, 0, '/' + gstateName + ' gs');
                }
                //this.internal.out('/' + gstateName + ' gs');
                //this.internal.out('Q');
                break;
            case 'normal':
            case 'source-over':
                this.internal.out('/' + groupName + ' Do');
                break;
        }
    };

    //
    // Graphics State
    //
    pdf.createGraphicsState = function (instructions) {
        if (this.internal.groupStack.length == 0) {
            window.outIntercept = null;
        } else {
            window.outIntercept = this.internal.groupStack[this.internal.groupStack.length - 1];
        }
    };

    pdf.graphicStateMap = {};

    pdf.pushOpacityGraphicsState = function (opacity) {
        //TODO do not set opacity if current value is already active
        var key = 'OPACITY' + opacity;
        var objOpac = this.graphicStateMap[key];
        if (!objOpac) {
            objOpac = this.internal.newObject2();
            objOpac.push('<</Type /ExtGState');
            //var ctx = this.canvas.getContext('2d');
            //objOpac.push(this.ctx.globalAlpha + " CA"); // Stroke
            //objOpac.push(this.ctx.globalAlpha + " ca"); // Not Stroke
            objOpac.push('/CA ' + opacity); // Stroke
            objOpac.push('/ca ' + opacity); // Not Stroke
            objOpac.push('>>');
            this.graphicStateMap[key] = objOpac;
        }
        var gsName = 'GS_O_' + objOpac.objId;
        this.internal.addGraphicsState(gsName, objOpac.objId);
        this.internal.out('/' + gsName + ' gs');
    };


    // Create a graphics state object for each blending mode

    pdf.initBlending = function () {
        pdfBlendModes.forEach(function (mode) {
            var obj = pdf.internal.newObject2();
            obj.push('<< /Type /ExtGState /ca 1 /CA 1 /BM /' + mode + ' /AIS false >>');
            pdf.internal.blendModeMap[mode.toUpperCase()] = 'GS' + obj.objId;
            pdf.internal.addGraphicsState('GS' + obj.objId, obj.objId);
        });
    };
    pdf.initBlending();

    //
    // Patterns
    //

    pdf.createPattern_Shading_Axial = function () {
        var obj = {
            Type: 'Pattern',
            PatternType: 2, // 2 = Shading
            Shading: {
                ShadingType: 2,
                ColorSpace: 'DeviceRGB',
                Coords: [300, 300, 500, 500],
                Function: {
                    FunctionType: 2,
                    Domain: [0, 1],
                    C0: [1, 0, 0],
                    C1: [0, 0, 1],
                    N: 1
                },
                Extend: [true, true]
            }
        };
        var obj = this.jsonToPdfObject(obj);
        return this.internal.addPattern(obj.objId);
    };

    //
    // Utility
    //

    pdf.createDictionary = function (obj) {
        var str = '<<';
        for (var key in obj) {
            var val = obj[key];
            if (typeof val === 'object') {
                if (Array.isArray(val)) {
                    str += '/' + key + ' [' + val.join(' ') + ']';
                } else {
                    str += '/' + key + ' ' + this.createDictionary(val);
                }
            }
            else if (typeof val === 'string') {
                str += '/' + key + ' /' + val;
            }
            else if (typeof val === 'number') {
                str += '/' + key + ' ' + val;

            }
            str += ' ';
        }
        str += '>> ';
        return str;
    };

    pdf.jsonToPdfObject = function (obj) {
        var strDict = this.createDictionary(obj);
        var obj = this.internal.newObject2();
        obj.push(strDict);
        return obj;
    };
}