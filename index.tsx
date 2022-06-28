import React, { forwardRef, useImperativeHandle } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  ImageSourcePropType,
  PanResponder,
  PanResponderInstance,
  Platform,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

type CropHandleCornerPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type CropHandleEdgePosition = "left" | "top" | "right" | "bottom";

export enum EditorDragMode {
  // IMAGE = "image", // TODO: Implement
  SELECTION = "selection",
}

interface IImageCropProps {
  source: ImageSourcePropType;
  imageWidth: number;
  imageHeight: number;
  cropBoxWidth: number;
  cropBoxHeight: number;
  containerStyle?: ViewStyle;
  circular?: boolean;
  maxScale?: number;
  /** Default is `selection` */
  dragMode?: EditorDragMode;
  // TODO: Implement
  zoomData?: {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  };
}

const DEFAULT_MAX_SCALE = 3;

const MINIMUM_IMAGE_SIZE = 80;

const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = Dimensions.get("screen");

const ImageCrop = forwardRef((props: IImageCropProps, ref) => {
  const maxScale = props.maxScale ?? DEFAULT_MAX_SCALE;

  /** Rendered width & height of image (at scale of 1) */
  const [_imageWidth, setImageWidth] = useState<number>(0);
  const [_imageHeight, setImageHeight] = useState<number>(0);
  const imageWidthRef = useRef(_imageWidth);
  const imageHeightRef = useRef(_imageHeight);
  const imageDiagonal = useRef<number>(0);

  const imageOffsetX = useRef<number>(0);
  const imageOffsetY = useRef<number>(0);
  const animatedImageOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 }));

  const cropBoxPosition = useRef({
    top: 0,
    bottom: 0,
    right: 0,
    left: 0,
  });
  const animatedCropBoxPosition = useRef({
    top: new Animated.Value(0),
    bottom: new Animated.Value(0),
    right: new Animated.Value(0),
    left: new Animated.Value(0),
  });
  const cropBoxImageOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 }));

  const scale = useRef<number>(1);
  const animatedScale = useRef(new Animated.Value(scale.current));

  /** Gesture context */
  const lastZoomDistance = useRef<number>();
  const zoomDistance = useRef<number>();

  const lastGestureDx = useRef<number>(0);
  const lastGestureDy = useRef<number>(0);

  const panResponders = useRef<{ [key: string]: PanResponderInstance }>({});

  useEffect(() => {
    imageWidthRef.current = _imageWidth;
  }, [_imageWidth]);

  useEffect(() => {
    imageHeightRef.current = _imageHeight;
  }, [_imageHeight]);

  useEffect(
    function calibrate() {
      // Calibrate internal dimensions based on provided dimensions

      if (props.imageWidth < props.imageHeight) {
        setImageWidth(props.cropBoxWidth);
        setImageHeight(
          (props.imageHeight / props.imageWidth) * props.cropBoxHeight
        );
      } else {
        setImageWidth(
          (props.imageWidth / props.imageHeight) * props.cropBoxWidth
        );
        setImageHeight(props.cropBoxHeight);
      }

      // Get diagonal size
      imageDiagonal.current = Math.floor(
        Math.sqrt(
          Math.pow(imageWidthRef.current, 2) +
            Math.pow(imageHeightRef.current, 2)
        )
      );
    },
    [
      props.imageWidth,
      props.imageHeight,
      props.cropBoxHeight,
      props.cropBoxWidth,
    ]
  );

  const imageDragAndPinchResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => {
        return true;
      },
      onPanResponderGrant: () => {
        lastZoomDistance.current = undefined;
        lastGestureDx.current = 0;
        lastGestureDy.current = 0;
      },
      onPanResponderMove: (event, gestureState) => {
        const { changedTouches } = event.nativeEvent;

        if (changedTouches.length <= 1) {
          // Handle drag

          switch (props.dragMode) {
            case EditorDragMode.SELECTION: {
              const incrementDx =
                lastGestureDx.current === null
                  ? 0
                  : gestureState.dx - lastGestureDx.current;
              const incrementDy =
                lastGestureDy.current === null
                  ? 0
                  : gestureState.dy - lastGestureDy.current;

              // Set cropBoxPosition and call calculateCropBoxPosition()
              // to get the position with constraints applied to it
              cropBoxPosition.current.bottom -= incrementDy;
              cropBoxPosition.current.top += incrementDy;
              cropBoxPosition.current.left += incrementDx;
              cropBoxPosition.current.right -= incrementDx;

              const newPosition = calculateCropBoxPosition(true);

              cropBoxPosition.current.bottom = newPosition.bottom;
              cropBoxPosition.current.top = newPosition.top;
              cropBoxPosition.current.left = newPosition.left;
              cropBoxPosition.current.right = newPosition.right;

              resizeCropBox();
              break;
            }
            case EditorDragMode.IMAGE:
            default: {
              imageOffsetX.current +=
                lastGestureDx.current === null
                  ? 0
                  : (gestureState.dx - lastGestureDx.current) / scale.current;
              imageOffsetY.current +=
                lastGestureDy.current === null
                  ? 0
                  : (gestureState.dy - lastGestureDy.current) / scale.current;
            }
          }
        } else {
          // Handle zoom
          const widthDistance =
            changedTouches[1].pageX - changedTouches[0].pageX;
          const heightDistance =
            changedTouches[1].pageY - changedTouches[0].pageY;
          zoomDistance.current = Math.floor(
            Math.sqrt(
              widthDistance * widthDistance + heightDistance * heightDistance
            )
          );

          if (lastZoomDistance.current) {
            let newScale =
              scale.current +
              (((zoomDistance.current - lastZoomDistance.current) *
                scale.current) /
                imageDiagonal.current) *
                2;
            if (newScale < 1) {
              newScale = 1;
            } else if (newScale > maxScale) {
              newScale = maxScale;
            }
            animatedScale.current.setValue(newScale);
            scale.current = newScale;
          }
          // Changing scale might cause us to go outside our translation constraints,
          // so we call translateImage() to make sure we stay within them
          lastZoomDistance.current = zoomDistance.current;
        }

        lastGestureDx.current = gestureState.dx;
        lastGestureDy.current = gestureState.dy;

        translateImage();
        // resizeCropBox();
      },
      onPanResponderEnd: () => {},
      onPanResponderTerminationRequest: (e, gestureState) => {
        return false;
      },
      onPanResponderTerminate: () => {
        console.log("TERMINATED");
      },
    });
  }, []);

  const getEdgeCropHandlePanResponder = (position: CropHandleEdgePosition) => {
    if (!panResponders.current[position])
      panResponders.current[position] = PanResponder.create({
        onStartShouldSetPanResponder: () => {
          return true;
        },
        onPanResponderGrant: () => {
          lastGestureDx.current = 0;
          lastGestureDy.current = 0;
        },
        onPanResponderMove: (event, gestureState) => {
          let shouldInvert = position === "right" || position === "bottom";

          let offset =
            position === "left" || position === "right"
              ? gestureState.dx
              : gestureState.dy;
          let lastGesture =
            position === "left" || position === "right"
              ? lastGestureDx.current
              : lastGestureDy.current;

          cropBoxPosition.current[position] += lastGesture
            ? (offset - lastGesture) * (shouldInvert ? -1 : 1)
            : 0;
          lastGestureDx.current = gestureState.dx;
          lastGestureDy.current = gestureState.dy;

          resizeCropBox();
        },
      });
    return panResponders.current[position];
  };

  const getCornerCropHandlePanResponder = (
    position: CropHandleCornerPosition
  ) => {
    if (!panResponders.current[position])
      panResponders.current[position] = PanResponder.create({
        onStartShouldSetPanResponder: () => {
          return true;
        },
        onPanResponderGrant: () => {
          lastGestureDx.current = 0;
          lastGestureDy.current = 0;
        },
        onPanResponderMove: (event, gestureState) => {
          const incrementDx = lastGestureDx.current
            ? gestureState.dx - lastGestureDx.current
            : 0;
          const incrementDy = lastGestureDy.current
            ? gestureState.dy - lastGestureDy.current
            : 0;

          if (position === "top-left" || position === "top-right") {
            cropBoxPosition.current.top += incrementDy;
          }
          if (position === "top-left" || position === "bottom-left") {
            cropBoxPosition.current.left += incrementDx;
          }
          if (position === "top-right" || position === "bottom-right") {
            cropBoxPosition.current.right -= incrementDx;
          }
          if (position === "bottom-left" || position === "bottom-right") {
            cropBoxPosition.current.bottom -= incrementDy;
          }

          lastGestureDx.current = gestureState.dx;
          lastGestureDy.current = gestureState.dy;

          resizeCropBox();
        },
      });

    return panResponders.current[position];
  };

  function translateImage() {
    const maxOffsetX =
      (imageWidthRef.current - props.cropBoxWidth / scale.current) / 2;
    const minOffsetX =
      -(imageWidthRef.current - props.cropBoxWidth / scale.current) / 2;
    const maxOffsetY =
      (imageHeightRef.current - props.cropBoxHeight / scale.current) / 2;
    const minOffsetY =
      -(imageHeightRef.current - props.cropBoxHeight / scale.current) / 2;

    if (imageOffsetX.current > maxOffsetX) {
      imageOffsetX.current = maxOffsetX;
    }
    if (imageOffsetX.current < minOffsetX) {
      imageOffsetX.current = minOffsetX;
    }
    if (imageOffsetY.current > maxOffsetY) {
      imageOffsetY.current = maxOffsetY;
    }
    if (imageOffsetY.current < minOffsetY) {
      imageOffsetY.current = minOffsetY;
    }

    animatedImageOffset.current.setValue({
      x: imageOffsetX.current,
      y: imageOffsetY.current,
    });
  }

  function calculateCropBoxPosition(preventResize?: boolean) {
    let calculatedPosition: any = {};
    let minValues: any = {};
    let maxValues: any = {};

    // Using this to override values at the end of execution before returning results
    let overridePosition: any = {};

    for (let position of Object.keys(cropBoxPosition.current)) {
      let value =
        cropBoxPosition.current[
          position as keyof typeof cropBoxPosition.current
        ];

      let minValue;
      let maxValue;

      // Effect of scale
      if (position === "top") {
        minValue =
          -(scale.current * imageHeightRef.current - imageHeightRef.current) /
          2;
        maxValue =
          imageHeightRef.current +
          (scale.current * imageHeightRef.current - imageHeightRef.current) /
            2 -
          MINIMUM_IMAGE_SIZE;
      } else if (position === "left") {
        minValue =
          -(scale.current * imageWidthRef.current - imageWidthRef.current) / 2;
        maxValue =
          imageWidthRef.current +
          (scale.current * imageWidthRef.current - imageWidthRef.current) / 2 -
          MINIMUM_IMAGE_SIZE;
      } else if (position === "bottom") {
        minValue =
          -(imageHeightRef.current * scale.current - imageHeightRef.current) /
          2;
        maxValue =
          imageHeightRef.current +
          (scale.current * imageHeightRef.current - imageHeightRef.current) /
            2 -
          MINIMUM_IMAGE_SIZE;
      } else {
        // "right"
        minValue =
          -(imageWidthRef.current * scale.current - imageWidthRef.current) / 2;
        maxValue =
          imageWidthRef.current +
          (scale.current * imageWidthRef.current - imageWidthRef.current) / 2 -
          MINIMUM_IMAGE_SIZE;
      }

      // Effect of offset
      if (position === "top" || position === "bottom") {
        minValue += imageOffsetY.current;
        maxValue += imageOffsetY.current;
      } else if (position === "left" || position === "right") {
        minValue -= imageOffsetX.current;
        maxValue -= imageOffsetX.current;
      }

      // Effect of opposite edge
      let oppositePosition;
      let imageSize;

      switch (position) {
        case "top": {
          imageSize = imageHeightRef.current;
          oppositePosition = cropBoxPosition.current.bottom;
          break;
        }
        case "bottom": {
          imageSize = imageHeightRef.current;
          oppositePosition = cropBoxPosition.current.top;
          break;
        }
        case "right": {
          imageSize = imageWidthRef.current;
          oppositePosition = cropBoxPosition.current.left;
          break;
        }
        default:
        case "left": {
          imageSize = imageWidthRef.current;
          oppositePosition = cropBoxPosition.current.right;
          break;
        }
      }

      maxValue = Math.min(
        imageSize - oppositePosition - MINIMUM_IMAGE_SIZE,
        maxValue
      );

      // Store calculated minimum and maximum values for later use
      minValues[position] = minValue;
      maxValues[position] = maxValue;

      // console.log("-----------------");
      // console.log(position, minValue, maxValue);
      // console.log(value);
      // console.log("-----------------");

      // Clamp to constraints
      if (value < minValue) {
        value = minValue;
      } else if (value > maxValue) {
        value = maxValue;
      }

      calculatedPosition[position] = value;
    }

    if (preventResize) {
      const cropBoxWidth =
        imageWidthRef.current -
        cropBoxPosition.current.left -
        cropBoxPosition.current.right;
      const cropBoxHeight =
        imageHeightRef.current -
        cropBoxPosition.current.top -
        cropBoxPosition.current.bottom;

      // Make sure that the crop box remains keeps its dimensions when dragged to the edges
      for (let position in calculatedPosition) {
        const value = calculatedPosition[position];
        const minValue = minValues[position];

        // For every edge of the crop box, check if we are at minimum value, and if we
        // are clamp the offset of the opposite edge to maintain resize of the crop box
        if (value === minValue) {
          // Get the minimum value of the opposite side if we are to preserve current size
          const oppositeMaxValueX =
            imageWidthRef.current +
            (imageWidthRef.current * scale.current - imageWidthRef.current) /
              2 -
            cropBoxWidth;
          const oppositeMaxValueY =
            imageHeightRef.current +
            (imageHeightRef.current * scale.current - imageHeightRef.current) /
              2 -
            cropBoxHeight;

          if (
            position === "left" &&
            calculatedPosition["right"] > oppositeMaxValueX
          ) {
            overridePosition["right"] = oppositeMaxValueX;
          } else if (
            position === "top" &&
            calculatedPosition["bottom"] > oppositeMaxValueY
          ) {
            overridePosition["bottom"] = oppositeMaxValueY;
          } else if (
            position === "right" &&
            calculatedPosition["left"] > oppositeMaxValueX
          ) {
            overridePosition["left"] = oppositeMaxValueX;
          } else if (
            position === "bottom" &&
            calculatedPosition["top"] > oppositeMaxValueY
          ) {
            overridePosition["top"] = oppositeMaxValueY;
          }
        }
      }
    }

    return Object.assign(calculatedPosition, overridePosition);
  }

  useImperativeHandle(ref, () => {
    function getCropData() {
      const {
        cropBoxWidth,
        cropBoxHeight,
        imageWidth: _imageWidth,
        imageHeight: _imageHeight,
      } = props;

      const ratioX = _imageWidth / imageWidthRef.current;
      const ratioY = _imageHeight / imageHeightRef.current;
      const width = cropBoxWidth / scale.current;
      const height = cropBoxHeight / scale.current;
      const x = imageWidthRef.current / 2 - (width / 2 + imageOffsetX.current);
      const y =
        imageHeightRef.current / 2 - (height / 2 + imageOffsetY.current);
      return {
        offset: { x: x * ratioX, y: y * ratioY },
        size: { width: width * ratioX, height: height * ratioY },
        zoomData: {
          translateX: imageOffsetX.current,
          translateY: imageOffsetY.current,
          scale: scale.current,
          currentZoomDistance: zoomDistance.current,
        },
      };
    }

    return {
      getCropData,
    };
  });

  function resizeCropBox() {
    const newPosition = calculateCropBoxPosition();

    for (let position of Object.keys(newPosition)) {
      cropBoxPosition.current[
        position as keyof typeof cropBoxPosition.current
      ] = newPosition[position];
      // Update position values
      animatedCropBoxPosition.current[
        position as keyof typeof animatedCropBoxPosition.current
      ].setValue(newPosition[position]);
    }

    // Update offset value
    cropBoxImageOffset.current.setValue({
      x: -cropBoxPosition.current.left / scale.current,
      y: -cropBoxPosition.current.top / scale.current,
    });
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    const dy = e.deltaY / -1000;

    let newScale = scale.current + dy;
    if (newScale < 1) {
      newScale = 1;
    } else if (newScale > maxScale) {
      newScale = maxScale;
    }
    animatedScale.current.setValue(newScale);
    scale.current = newScale;
    translateImage();
    resizeCropBox();
  }

  const imageContainerStyle = {
    zIndex: -99,
    transform: [
      {
        scale: animatedScale.current,
      },
      {
        translateX: animatedImageOffset.current.x,
      },
      {
        translateY: animatedImageOffset.current.y,
      },
    ],
  };

  const cropBoxStyle = {
    top: animatedCropBoxPosition.current.top,
    bottom: animatedCropBoxPosition.current.bottom,
    right: animatedCropBoxPosition.current.right,
    left: animatedCropBoxPosition.current.left,
  };

  const ScrolWheelCaptureWrapper = (props: React.PropsWithChildren<{}>) => {
    return Platform.OS === "web" ? (
      <div onWheel={onWheel}>{props.children}</div>
    ) : (
      <>{props.children}</>
    );
  };

  return (
    <ScrolWheelCaptureWrapper>
      <View
        style={[styles.container]}
        {...imageDragAndPinchResponder.panHandlers}
      >
        {/* OVERFLOW IMAGE */}
        <Animated.View
          style={[imageContainerStyle, styles.overflowImageContainer]}
        >
          <Image
            style={{
              width: _imageWidth,
              height: _imageHeight,
            }}
            resizeMode="contain"
            source={props.source}
          />
        </Animated.View>

        {/* FOCUS AREA*/}
        <View
          style={[
            styles.focusContainer,
            {
              width: _imageWidth,
              height: _imageHeight,
            },
          ]}
        >
          {/* IMAGE */}
          <Animated.View
            style={[
              cropBoxStyle,
              {
                display: "flex",
                position: "absolute",
                overflow: "hidden",
                borderRadius: props.circular ? 1000 : 0,
              },
            ]}
          >
            <Animated.Image
              style={[
                {
                  transform: [
                    {
                      scale: animatedScale.current,
                    },
                    {
                      translateY: Animated.add(
                        cropBoxImageOffset.current.y,
                        animatedImageOffset.current.y
                      ),
                    },
                    {
                      translateX: Animated.add(
                        cropBoxImageOffset.current.x,
                        animatedImageOffset.current.x
                      ),
                    },
                  ],
                  position: "absolute",
                  width: _imageWidth,
                  height: _imageHeight,
                },
              ]}
              resizeMode="contain"
              source={props.source}
              onLoad={(event) => {
                console.log("IMAGE LOADED", event.nativeEvent.source);
              }}
            />
          </Animated.View>

          {/* CROP BOX */}
          <Animated.View
            pointerEvents={"box-none"}
            style={[
              styles.cropBox,
              cropBoxStyle,
              { display: props.circular ? "none" : "flex" },
            ]}
          >
            {/* EDGE HANDLES */}
            <Animated.View
              style={styles.topEdgeHandle}
              {...getEdgeCropHandlePanResponder("top").panHandlers}
            >
              <Animated.View
                style={styles.topEdgeOuterHandle}
                {...getEdgeCropHandlePanResponder("top").panHandlers}
              />
            </Animated.View>
            <Animated.View
              style={styles.bottomEdgeHandle}
              {...getEdgeCropHandlePanResponder("bottom").panHandlers}
            >
              <Animated.View
                style={styles.bottomEdgeOuterHandle}
                {...getEdgeCropHandlePanResponder("bottom").panHandlers}
              />
            </Animated.View>
            <Animated.View
              style={styles.leftEdgeHandle}
              {...getEdgeCropHandlePanResponder("left").panHandlers}
            >
              <Animated.View
                style={styles.leftEdgeOuterHandle}
                {...getEdgeCropHandlePanResponder("left").panHandlers}
              />
            </Animated.View>
            <Animated.View
              style={styles.rightEdgeHandle}
              {...getEdgeCropHandlePanResponder("right").panHandlers}
            >
              <Animated.View
                style={styles.rightEdgeOuterHandle}
                {...getEdgeCropHandlePanResponder("right").panHandlers}
              />
            </Animated.View>

            {/* CORNER HANDLES */}
            <Animated.View
              {...getCornerCropHandlePanResponder("top-left").panHandlers}
              style={styles.topLeftCornerHandle}
            ></Animated.View>
            <Animated.View
              {...getCornerCropHandlePanResponder("top-right").panHandlers}
              style={styles.topRightCornerHandle}
            ></Animated.View>
            <Animated.View
              {...getCornerCropHandlePanResponder("bottom-left").panHandlers}
              style={styles.bottomLeftCornerHandle}
            ></Animated.View>
            <Animated.View
              {...getCornerCropHandlePanResponder("bottom-right").panHandlers}
              style={styles.bottomRightCornerHandle}
            ></Animated.View>
          </Animated.View>
        </View>
      </View>
    </ScrolWheelCaptureWrapper>
  );
});
export default ImageCrop;

const styles = StyleSheet.create({
  container: {
    padding: 32,
    cursor: "grab",
    backgroundColor: "black",
    justifyContent: "center",
    alignItems: "center",
  },
  overflowImageContainer: {
    zIndex: -1,
    position: "absolute",
    opacity: 0.4,
  },
  focusContainer: {},
  cropBox: {
    position: "absolute",
  },
  overlayTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -DEVICE_HEIGHT,
    height: DEVICE_HEIGHT,
  },
  overlayBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -DEVICE_HEIGHT,
    height: DEVICE_HEIGHT,
  },
  overlayRight: {
    position: "absolute",
    right: -DEVICE_WIDTH,
    top: -DEVICE_HEIGHT,
    width: DEVICE_WIDTH,
    bottom: -DEVICE_HEIGHT,
  },
  overlayLeft: {
    position: "absolute",
    width: DEVICE_WIDTH,
    left: -DEVICE_WIDTH,
    top: -DEVICE_HEIGHT,
    bottom: -DEVICE_HEIGHT,
  },
  topEdgeHandle: {
    cursor: "ns-resize",
    position: "absolute",
    left: 18,
    right: 18,
    height: 20,
    borderTopColor: "#EEE",
    borderTopWidth: 1,
  },
  bottomEdgeHandle: {
    cursor: "ns-resize",
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 0,
    height: 20,
    borderColor: "#EEE",
    borderBottomWidth: 1,
  },
  rightEdgeHandle: {
    cursor: "ew-resize",
    position: "absolute",
    top: 18,
    bottom: 18,
    right: 0,
    width: 20,
    borderColor: "#EEE",
    borderRightWidth: 1,
  },
  leftEdgeHandle: {
    cursor: "ew-resize",
    position: "absolute",
    top: 18,
    bottom: 18,
    left: 0,
    width: 20,
    borderColor: "#EEE",
    borderLeftWidth: 1,
  },
  topLeftCornerHandle: {
    zIndex: 3,
    opacity: 0.7,
    cursor: "nwse-resize",
    position: "absolute",
    left: 0,
    top: 0,
    width: 18,
    height: 18,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderColor: "#fff",
  },
  topRightCornerHandle: {
    zIndex: 3,
    cursor: "nesw-resize",
    opacity: 0.7,
    position: "absolute",
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderColor: "#fff",
  },
  bottomLeftCornerHandle: {
    zIndex: 3,
    cursor: "nesw-resize",
    opacity: 0.7,
    position: "absolute",
    left: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: "#fff",
  },
  bottomRightCornerHandle: {
    zIndex: 3,
    cursor: "nwse-resize",
    opacity: 0.7,
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: "#fff",
  },
  topEdgeOuterHandle: {
    height: 10,
    top: -10,
    left: 15,
    right: 15,
    position: "absolute",
    cursor: "ns-resize",
  },
  bottomEdgeOuterHandle: {
    height: 10,
    position: "absolute",
    bottom: -10,
    left: 15,
    right: 15,
    cursor: "ns-resize",
  },
  leftEdgeOuterHandle: {
    width: 10,
    position: "absolute",
    top: 15,
    bottom: 15,
    left: -10,
    cursor: "ew-resize",
  },
  rightEdgeOuterHandle: {
    width: 10,
    position: "absolute",
    top: 15,
    bottom: 15,
    right: -10,
    cursor: "ew-resize",
  },
});
