import React, { Component } from 'react';
import {
  View,
  PanResponder,
  Animated,
  Image,
  StyleSheet,
  PanResponderInstance,
  ViewStyle,
  ImageSourcePropType,
} from 'react-native';

import ClipRect from '@mtourj/react-native-clip-rect';

interface IImageCropProps {
  editRectWidth: number;
  editRectHeight: number;
  imageWidth: number;
  imageHeight: number;
  maxScale?: number;
  editRectRadius?: number;
  source?: ImageSourcePropType;
  style?: ViewStyle;
  overlayColor?: string;
  zoomData?: {
    translateX: number;
    translateY: number;
    scale: number;
    currentZoomDistance: number;
  };
}

export default class ImageCrop extends Component<IImageCropProps> {
  lastGestureDx: number;
  translateX: number;
  animatedTranslateX: Animated.Value;

  lastGestureDy: number;
  translateY: number;
  animatedTranslateY: Animated.Value;

  scale: number;
  maxScale: number;
  animatedScale: Animated.Value;
  lastZoomDistance: number;
  currentZoomDistance: number;

  imageMinWidth: number;
  imageMinHeight: number;
  imageMinSize: number;

  imagePanResponder: PanResponderInstance;

  static defaultProps = {
    editRectWidth: 212,
    editRectHeight: 212,
    editRectRadius: 106,
    overlayColor: 'rgba(0, 0, 0, 0.7)',
  };

  constructor(props) {
    super(props);

    this.animatedTranslateX = new Animated.Value(0);
    this.animatedTranslateY = new Animated.Value(0);
    this.animatedScale = new Animated.Value(0);

    this.calibrate();
    
    this.imagePanResponder = PanResponder.create({
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
        } else {
          const widthDistance =
            changedTouches[1].pageX - changedTouches[0].pageX;
          const heightDistance =
            changedTouches[1].pageY - changedTouches[0].pageY;
          this.currentZoomDistance = Math.floor(
            Math.sqrt(
              widthDistance * widthDistance + heightDistance * heightDistance
            )
          );

          if (this.lastZoomDistance !== null) {
            let scale =
              this.scale +
              (((this.currentZoomDistance - this.lastZoomDistance) *
                this.scale) /
                this.imageMinSize) *
                2;
            if (scale < 1) {
              scale = 1;
            } else if (scale > this.maxScale) {
              scale = this.maxScale;
            }
            this.animatedScale.setValue(scale);
            this.updateTranslate();
            this.scale = scale;
          }
          this.lastZoomDistance = this.currentZoomDistance;
        }
      },
      onPanResponderRelease: (evt, gestureState) => {},
      onPanResponderTerminate: (evt, gestureState) => {},
    });
  }

  calibrate() {
    const { currentZoomDistance, scale, translateX, translateY } =
      this.props.zoomData || {};

    // Last/current/animation x displacement
    this.lastGestureDx = null;
    this.translateX = translateX || 0;
    this.animatedTranslateX.setValue(translateX);

    // Last/current/animation y displacement
    this.lastGestureDy = null;
    this.translateY = translateY || 0;
    this.animatedTranslateY.setValue(translateY);

    // Zoom size
    this.scale = scale || 1;
    this.animatedScale.setValue(0);
    this.lastZoomDistance = null;
    this.currentZoomDistance = currentZoomDistance || 0;

    // Image size

    const {
      editRectWidth,
      editRectHeight,
      imageWidth,
      imageHeight,
      maxScale,
    } = this.props;

    this.maxScale = maxScale || 3;

    if (imageWidth < imageHeight) {
      this.imageMinWidth = editRectWidth;
      this.imageMinHeight = (imageHeight / imageWidth) * editRectHeight;
    } else {
      this.imageMinWidth = (imageWidth / imageHeight) * editRectWidth;
      this.imageMinHeight = editRectHeight;
    }
    this.imageMinSize = Math.floor(
      Math.sqrt(
        this.imageMinWidth * this.imageMinWidth +
          this.imageMinHeight * this.imageMinHeight
      )
    );
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
    const {
      editRectWidth,
      editRectHeight,
      imageWidth,
      imageHeight,
    } = this.props;
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
    // With every render, we make sure our measurements are up-to-date
    this.calibrate();

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
    const {
      editRectWidth,
      editRectHeight,
      editRectRadius,
      source,
      style,
      overlayColor,
    } = this.props;
    return (
      <View
        style={[styles.container, style]}
        {...this.imagePanResponder.panHandlers}
      >
        <Animated.View pointerEvents='none' style={animatedStyle}>
          <Image
            resizeMode='contain'
            style={{
              width: this.imageMinWidth,
              height: this.imageMinHeight,
              zIndex: -99,
            }}
            source={source}
          />
        </Animated.View>
        <View style={styles.editboxContainer}>
          <View style={{ flex: 1, backgroundColor: overlayColor }} />
          <View style={styles.editboxMiddle}>
            <View style={{ flex: 1, backgroundColor: overlayColor }} />
            <View style={{ width: editRectWidth, height: editRectHeight }}>
              <ClipRect
                style={{
                  width: editRectWidth,
                  height: editRectHeight,
                  borderRadius: editRectRadius,
                  color: overlayColor,
                }}
              />
              <View
                style={[styles.clipRectBoder, { borderRadius: editRectRadius }]}
              />
            </View>
            <View style={{ flex: 1, backgroundColor: overlayColor }} />
          </View>
          <View style={{ flex: 1, backgroundColor: overlayColor }} />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'black',
    zIndex: -99,
  },
  editboxContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  clipRectBoder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderColor: '#AAAA',
    borderWidth: 1,
  },
  editboxMiddle: {
    flexDirection: 'row',
  },
});
