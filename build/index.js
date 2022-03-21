"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_clip_rect_1 = __importDefault(require("@mtourj/react-native-clip-rect"));
class ImageCrop extends react_1.Component {
    constructor(props) {
        super(props);
        this.lastGestureDx = null;
        this.lastGestureDy = null;
        this.lastZoomDistance = null;
        this.translateX = 0;
        this.translateY = 0;
        this.scale = 0;
        this.maxScale = 3;
        this.currentZoomDistance = 0;
        this.imageMinHeight = 0;
        this.imageMinWidth = 0;
        this.imageMinSize = 0;
        this.state = {
            imageMinWidth: 0,
            imageMinHeight: 0,
        };
        this.animatedTranslateX = new react_native_1.Animated.Value(0);
        this.animatedTranslateY = new react_native_1.Animated.Value(0);
        this.animatedScale = new react_native_1.Animated.Value(0);
        this.calibrate();
        this.imagePanResponder = react_native_1.PanResponder.create({
            onStartShouldSetPanResponder: (evt, gestureState) => true,
            onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
            onMoveShouldSetPanResponder: (evt, gestureState) => true,
            onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,
            onPanResponderTerminationRequest: (evt, gestureState) => false,
            onPanResponderGrant: (evt, gestureState) => {
                this.lastGestureDx = null;
                this.lastGestureDy = null;
                this.lastZoomDistance = null;
            },
            onPanResponderMove: (evt, gestureState) => {
                const { changedTouches } = evt.nativeEvent;
                if (changedTouches.length <= 1) {
                    this.translateX +=
                        this.lastGestureDx === null
                            ? 0
                            : (gestureState.dx - this.lastGestureDx) / 2;
                    this.translateY +=
                        this.lastGestureDy === null
                            ? 0
                            : (gestureState.dy - this.lastGestureDy) / 2;
                    this.lastGestureDx = gestureState.dx;
                    this.lastGestureDy = gestureState.dy;
                    this.updateTranslate();
                }
                else {
                    const widthDistance = changedTouches[1].pageX - changedTouches[0].pageX;
                    const heightDistance = changedTouches[1].pageY - changedTouches[0].pageY;
                    this.currentZoomDistance = Math.floor(Math.sqrt(widthDistance * widthDistance + heightDistance * heightDistance));
                    if (this.lastZoomDistance !== null) {
                        let scale = this.scale +
                            (((this.currentZoomDistance - this.lastZoomDistance) *
                                this.scale) /
                                this.imageMinSize) *
                                2;
                        if (scale < 1) {
                            scale = 1;
                        }
                        else if (scale > this.maxScale) {
                            scale = this.maxScale;
                        }
                        this.animatedScale.setValue(scale);
                        this.updateTranslate();
                        this.scale = scale;
                    }
                    this.lastZoomDistance = this.currentZoomDistance;
                }
            },
            onPanResponderRelease: (evt, gestureState) => { },
            onPanResponderTerminate: (evt, gestureState) => { },
        });
    }
    calibrate() {
        const { currentZoomDistance, scale, translateX, translateY } = this.props.zoomData || {};
        // Last/current/animation x displacement
        this.lastGestureDx = null;
        this.translateX = translateX || 0;
        this.animatedTranslateX.setValue(translateX !== null && translateX !== void 0 ? translateX : 0);
        // Last/current/animation y displacement
        this.lastGestureDy = null;
        this.translateY = translateY || 0;
        this.animatedTranslateY.setValue(translateY !== null && translateY !== void 0 ? translateY : 0);
        // Zoom size
        this.scale = scale || 1;
        this.animatedScale.setValue(this.scale);
        this.lastZoomDistance = null;
        this.currentZoomDistance = currentZoomDistance || 0;
        // Image size
        this.maxScale = this.props.maxScale || 3;
    }
    calibrateImageSize() {
        const { editRectWidth, editRectHeight, imageWidth, imageHeight } = this.props;
        if (imageWidth < imageHeight) {
            this.imageMinWidth = editRectWidth;
            this.imageMinHeight = (imageHeight / imageWidth) * editRectHeight;
        }
        else {
            this.imageMinWidth = (imageWidth / imageHeight) * editRectWidth;
            this.imageMinHeight = editRectHeight;
        }
        this.imageMinSize = Math.floor(Math.sqrt(this.imageMinWidth * this.imageMinWidth +
            this.imageMinHeight * this.imageMinHeight));
        return {
            imageMinWidth: this.imageMinWidth,
            imageMinHeight: this.imageMinHeight,
        };
    }
    updateTranslate() {
        const { editRectWidth, editRectHeight } = this.props;
        const xOffest = (this.imageMinWidth - editRectWidth / this.scale) / 2;
        const yOffest = (this.imageMinHeight - editRectHeight / this.scale) / 2;
        if (this.translateX > xOffest) {
            this.translateX = xOffest;
        }
        if (this.translateX < -xOffest) {
            this.translateX = -xOffest;
        }
        if (this.translateY > yOffest) {
            this.translateY = yOffest;
        }
        if (this.translateY < -yOffest) {
            this.translateY = -yOffest;
        }
        this.animatedTranslateX.setValue(this.translateX);
        this.animatedTranslateY.setValue(this.translateY);
    }
    getCropData() {
        const { editRectWidth, editRectHeight, imageWidth, imageHeight } = this.props;
        const ratioX = imageWidth / this.imageMinWidth;
        const ratioY = imageHeight / this.imageMinHeight;
        const width = editRectWidth / this.scale;
        const height = editRectHeight / this.scale;
        const x = this.imageMinWidth / 2 - (width / 2 + this.translateX);
        const y = this.imageMinHeight / 2 - (height / 2 + this.translateY);
        return {
            offset: { x: x * ratioX, y: y * ratioY },
            size: { width: width * ratioX, height: height * ratioY },
            zoomData: {
                translateX: this.translateX,
                translateY: this.translateY,
                scale: this.scale,
                currentZoomDistance: this.currentZoomDistance,
            },
        };
    }
    render() {
        const animatedStyle = {
            zIndex: -99,
            transform: [
                {
                    scale: this.animatedScale,
                },
                {
                    translateX: this.animatedTranslateX,
                },
                {
                    translateY: this.animatedTranslateY,
                },
            ],
        };
        const { editRectWidth, editRectHeight, editRectRadius, style, source, overlayColor, } = this.props;
        return (react_1.default.createElement(react_native_1.View, Object.assign({ style: [styles.container, style] }, this.imagePanResponder.panHandlers),
            react_1.default.createElement(react_native_1.Animated.View, { pointerEvents: "none", style: animatedStyle },
                react_1.default.createElement(react_native_1.Image, { resizeMode: "cover", style: {
                        width: this.state.imageMinWidth || 1,
                        height: this.state.imageMinHeight || 1,
                        zIndex: -99,
                    }, onLoadEnd: () => {
                        // Once the new image has loaded, we calibrate our measurements
                        this.setState(this.calibrateImageSize());
                        this.calibrate();
                    }, source: source !== null && source !== void 0 ? source : {} })),
            react_1.default.createElement(react_native_1.View, { style: styles.editboxContainer },
                react_1.default.createElement(react_native_1.View, { style: { flex: 1, backgroundColor: overlayColor } }),
                react_1.default.createElement(react_native_1.View, { style: styles.editboxMiddle },
                    react_1.default.createElement(react_native_1.View, { style: { flex: 1, backgroundColor: overlayColor } }),
                    react_1.default.createElement(react_native_1.View, { style: { width: editRectWidth, height: editRectHeight } },
                        react_1.default.createElement(react_native_clip_rect_1.default, { style: {
                                width: editRectWidth,
                                height: editRectHeight,
                                borderRadius: editRectRadius,
                                color: overlayColor,
                            } }),
                        react_1.default.createElement(react_native_1.View, { style: [styles.clipRectBoder, { borderRadius: editRectRadius }] })),
                    react_1.default.createElement(react_native_1.View, { style: { flex: 1, backgroundColor: overlayColor } })),
                react_1.default.createElement(react_native_1.View, { style: { flex: 1, backgroundColor: overlayColor } }))));
    }
}
exports.default = ImageCrop;
ImageCrop.defaultProps = {
    editRectWidth: 212,
    editRectHeight: 212,
    editRectRadius: 106,
    overlayColor: "rgba(0, 0, 0, 0.7)",
};
const styles = react_native_1.StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        backgroundColor: "black",
        zIndex: -99,
    },
    editboxContainer: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
    clipRectBoder: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        borderColor: "#AAAA",
        borderWidth: 1,
    },
    editboxMiddle: {
        flexDirection: "row",
    },
});
