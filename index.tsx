import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
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

export enum DragMode {
  IMAGE = "image",
  SELECTION = "selection",
}

interface IImageCropProps {
  source: ImageSourcePropType;
  /** Width of source image - Required */
  imageWidth: number;
  /** Height of source image - Required */
  imageHeight: number;
  /** Width of cropping area*/
  initialCropBoxWidth?: number;
  /** Height of cropping area*/
  initialCropBoxHeight?: number;
  containerStyle?: ViewStyle;
  /** Enable circular selection. Setting to true will also
   * force the crop box to be a square */
  circular?: boolean;
  maxScale?: number;
  /** Default is false. If set, cropping box will always keep
   * an aspect ratio of cropBoxWidth / cropBoxHeight */
  fixedRatio?: boolean;
  /** Default is `DragMode.IMAGE` */
  dragMode?: DragMode;
  zoomData?: {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  };
}

const DEFAULT_MAX_SCALE = 3;
const DEFAULT_CROP_SIZE = 350;
const MINIMUM_IMAGE_SIZE = 80;

const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = Dimensions.get("screen");

const ImageCrop = forwardRef((props: IImageCropProps, ref) => {
  let initialCropBoxWidth =
    props.initialCropBoxWidth ??
    DEFAULT_CROP_SIZE * (props.imageWidth / DEFAULT_CROP_SIZE);
  let initialCropBoxHeight =
    props.initialCropBoxHeight ??
    DEFAULT_CROP_SIZE * (props.imageHeight / DEFAULT_CROP_SIZE);

  /** Force the crop box to be a square if `circular` is set */
  if (props.circular) {
    const largerSide = Math.max(initialCropBoxHeight, initialCropBoxWidth);
    initialCropBoxHeight = largerSide;
    initialCropBoxWidth = largerSide;
  }

  const maxScale = props.maxScale ?? DEFAULT_MAX_SCALE;

  /** Rendered width & height of image (at scale of 1) */
  const [_imageWidth, setImageWidth] = useState<number>(0);
  const [_imageHeight, setImageHeight] = useState<number>(0);
  const imageWidthRef = useRef(_imageWidth);
  const imageHeightRef = useRef(_imageHeight);
  const imageDiagonal = useRef<number>(0);

  // For for animating automated cropbox re-centers
  const viewportOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 }));

  const isCropBoxMoving = useRef(false);

  const topEdgeActivityIndicatorScale = useRef(new Animated.Value(0));
  const bottomEdgeActivityIndicatorScale = useRef(new Animated.Value(0));
  const rightEdgeActivityIndicatorScale = useRef(new Animated.Value(0));
  const leftEdgeActivityIndicatorScale = useRef(new Animated.Value(0));

  const imageOffsetX = useRef<number>(0);
  const imageOffsetY = useRef<number>(0);
  const animatedImageOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 }));

  const animatedOverflowImageOpacity = useRef(new Animated.Value(0.4));

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

  function getCropBoxWidth() {
    return (
      imageWidthRef.current -
      cropBoxPosition.current.left -
      cropBoxPosition.current.right
    );
  }

  function getCropBoxHeight() {
    return (
      imageHeightRef.current -
      cropBoxPosition.current.top -
      cropBoxPosition.current.bottom
    );
  }

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

  // useEffect(() => {
  //   if (isDragging) {
  //     Animated.timing(animatedOverflowImageOpacity.current, {
  //       toValue: 0.7,
  //       useNativeDriver: true,
  //       duration: 100,
  //       easing: Easing.out(Easing.poly(4)),
  //     }).start();
  //   } else {
  //     Animated.timing(animatedOverflowImageOpacity.current, {
  //       toValue: 0.4,
  //       useNativeDriver: true,
  //       duration: 140,
  //       easing: Easing.out(Easing.poly(4)),
  //     }).start();
  //   }
  // }, [isDragging]);

  useEffect(
    function calibrate() {
      // Calibrate internal dimensions based on provided dimensions

      const cropBoxRatio = initialCropBoxWidth / initialCropBoxHeight;
      const imageRatio = props.imageWidth / props.imageHeight;

      let width;
      let height;

      if (props.imageWidth < props.imageHeight) {
        if (cropBoxRatio >= 1) {
          width = initialCropBoxWidth;
          height = (initialCropBoxHeight / imageRatio) * cropBoxRatio;
        } else {
          width = (initialCropBoxWidth * imageRatio) / cropBoxRatio;
          height = initialCropBoxHeight;
        }
      } else {
        if (cropBoxRatio > 1) {
          width = initialCropBoxWidth;
          height = (initialCropBoxHeight / imageRatio) * cropBoxRatio;
        } else {
          width = (initialCropBoxWidth * imageRatio) / cropBoxRatio;
          height = initialCropBoxHeight;
        }
      }

      // if (cropBoxRatio > 1) {
      //   height = cropBoxRatio * height;
      // } else {
      //   width = cropBoxRatio * width;
      // }

      setImageWidth(width);
      setImageHeight(height);
      // Immediate update refs because they will be used by resizeCropBox() before useEffect can update them
      imageWidthRef.current = width;
      imageHeightRef.current = height;

      // Get crop box offset so that it matches the provided initialCropBoxWidth/Height
      let offsetX = Math.max(width - initialCropBoxWidth, 0);
      let offsetY = Math.max(height - initialCropBoxHeight, 0);

      cropBoxPosition.current.top = offsetY / 2;
      cropBoxPosition.current.bottom = offsetY / 2;
      cropBoxPosition.current.right = offsetX / 2;
      cropBoxPosition.current.left = offsetX / 2;

      resizeCropBox();

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
      props.initialCropBoxHeight,
      props.initialCropBoxWidth,
    ]
  );

  const imageDragAndPinchResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => {
        return !isCropBoxMoving.current;
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
            case DragMode.SELECTION: {
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
            case DragMode.IMAGE:
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

          resizeCropBox();
        }

        lastGestureDx.current = gestureState.dx;
        lastGestureDy.current = gestureState.dy;

        translateImage();
      },
      onPanResponderEnd: () => {},
      onPanResponderTerminationRequest: (e, gestureState) => {
        return false;
      },
      onPanResponderTerminate: () => {
        // console.log("TERMINATED");
      },
    });
  }, []);

  const getEdgeCropHandlePanResponder = (position: CropHandleEdgePosition) => {
    if (!panResponders.current[position])
      panResponders.current[position] = PanResponder.create({
        onStartShouldSetPanResponder: () => {
          // If fixedRatio is enabled, do not respond to edge movement
          return (
            !isCropBoxMoving.current && !props.circular && !props.fixedRatio
          );
        },
        onPanResponderGrant: () => {
          lastGestureDx.current = 0;
          lastGestureDy.current = 0;
          animateActiveEdgeStart(position);
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
        onPanResponderEnd: () => {
          recenterCropBox();
          animateActiveEdgeEnd(position);
        },
        onPanResponderTerminate: () => {
          recenterCropBox();
          animateActiveEdgeEnd(position);
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
          return !isCropBoxMoving.current;
        },
        onPanResponderGrant: () => {
          lastGestureDx.current = 0;
          lastGestureDy.current = 0;
        },
        onPanResponderMove: (event, gestureState) => {
          let incrementDx = lastGestureDx.current
            ? gestureState.dx - lastGestureDx.current
            : 0;
          let incrementDy = lastGestureDy.current
            ? gestureState.dy - lastGestureDy.current
            : 0;

          if (props.fixedRatio) {
            let ratioX = getCropBoxWidth() / getCropBoxHeight();
            let ratioY = 1 / ratioX;

            if (ratioX < 1) ratioX = 1;
            if (ratioY < 1) ratioY = 1;

            let movementX =
              position === "top-right" ? incrementDx * -1 : incrementDx;
            let movementY =
              position === "bottom-right" ? incrementDy * -1 : incrementDy;

            // get diagonal distance
            const incrementDd =
              Math.floor(
                Math.sqrt(Math.pow(incrementDx, 2) + Math.pow(incrementDy, 2))
              ) / Math.sqrt(2);
            const incrementDdirection = movementX + movementY > 0 ? 1 : 0;

            let multiplier = 1;

            if (incrementDdirection === 0) multiplier *= -1;

            incrementDx = (incrementDd / ratioY) * multiplier;
            incrementDy = (incrementDd / ratioX) * multiplier;

            if (position === "top-right" || position === "bottom-right")
              incrementDx *= -1;
            if (position === "bottom-left" || position === "bottom-right")
              incrementDy *= -1;
          }

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
        onPanResponderEnd: () => {
          recenterCropBox();
        },
        onPanResponderTerminate: () => {
          recenterCropBox();
        },
      });

    return panResponders.current[position];
  };

  function recenterCropBox() {
    if (props.dragMode !== DragMode.IMAGE) return;

    isCropBoxMoving.current = true;

    const cropBoxWidth = getCropBoxWidth();
    const cropBoxHeight = getCropBoxHeight();

    const centeredPosition = {
      left: (imageWidthRef.current - cropBoxWidth) / 2,
      right: (imageWidthRef.current - cropBoxWidth) / 2,
      top: (imageHeightRef.current - cropBoxHeight) / 2,
      bottom: (imageHeightRef.current - cropBoxHeight) / 2,
    };

    const changeAmount = {
      left: centeredPosition.left - cropBoxPosition.current.left,
      right: centeredPosition.right - cropBoxPosition.current.right,
      top: centeredPosition.top - cropBoxPosition.current.top,
      bottom: centeredPosition.bottom - cropBoxPosition.current.bottom,
    };

    cropBoxPosition.current = centeredPosition;

    animatedCropBoxPosition.current.bottom.setValue(centeredPosition.bottom);
    animatedCropBoxPosition.current.top.setValue(centeredPosition.top);
    animatedCropBoxPosition.current.left.setValue(centeredPosition.left);
    animatedCropBoxPosition.current.right.setValue(centeredPosition.right);

    imageOffsetX.current += changeAmount.left / scale.current;
    imageOffsetY.current += changeAmount.top / scale.current;

    // TODO: Include scale

    animatedImageOffset.current.setValue({
      x: imageOffsetX.current,
      y: imageOffsetY.current,
    });

    viewportOffset.current.setValue({
      x: -changeAmount.left,
      y: -changeAmount.top,
    });

    // translateImage();
    resizeCropBox();

    Animated.timing(viewportOffset.current, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      duration: 500,
      easing: Easing.out(Easing.poly(4)),
    }).start(() => {
      isCropBoxMoving.current = false;
    });
  }

  function translateImage() {
    const maxOffsetX =
      (imageWidthRef.current - getCropBoxWidth() / scale.current) / 2;
    const minOffsetX =
      -(imageWidthRef.current - getCropBoxWidth() / scale.current) / 2;
    const maxOffsetY =
      (imageHeightRef.current - getCropBoxHeight() / scale.current) / 2;
    const minOffsetY =
      -(imageHeightRef.current - getCropBoxHeight() / scale.current) / 2;

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
      if (position === "top") {
        minValue += imageOffsetY.current * scale.current;
        maxValue += imageOffsetY.current * scale.current;
      } else if (position === "bottom") {
        maxValue -= imageOffsetY.current * scale.current;
        minValue -= imageOffsetY.current * scale.current;
      } else if (position === "left") {
        minValue += imageOffsetX.current * scale.current;
        maxValue += imageOffsetX.current * scale.current;
      } else if (position === "right") {
        minValue -= imageOffsetX.current * scale.current;
        maxValue -= imageOffsetX.current * scale.current;
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

      // If we have `fixedRatio` set and we are out of bounds, that means
      // we do not want to move at all, so we can just return the original position
      if (props.fixedRatio && (value < minValue || value > maxValue)) {
        return {
          // @ts-ignore
          top: animatedCropBoxPosition.current.top.__getValue(),
          // @ts-ignore
          bottom: animatedCropBoxPosition.current.bottom.__getValue(),
          // @ts-ignore
          right: animatedCropBoxPosition.current.right.__getValue(),
          // @ts-ignore
          left: animatedCropBoxPosition.current.left.__getValue(),
        };
      }

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

      // Make sure that the crop box keeps its dimensions when dragged to the edges
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

  useImperativeHandle(ref, () => {
    function getCropData() {
      const { imageWidth: _imageWidth, imageHeight: _imageHeight } = props;

      const ratioX = _imageWidth / imageWidthRef.current;
      const ratioY = _imageHeight / imageHeightRef.current;
      const width = getCropBoxWidth() / scale.current;
      const height = getCropBoxHeight() / scale.current;
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

  const animateActiveEdgeStart = (position: CropHandleEdgePosition) => {
    let animatedValue;

    switch (position) {
      case "top": {
        animatedValue = topEdgeActivityIndicatorScale;
        break;
      }
      case "bottom": {
        animatedValue = bottomEdgeActivityIndicatorScale;
        break;
      }
      case "right": {
        animatedValue = rightEdgeActivityIndicatorScale;
        break;
      }
      default:
      case "left": {
        animatedValue = leftEdgeActivityIndicatorScale;
        break;
      }
    }

    Animated.timing(animatedValue.current, {
      toValue: 1,
      useNativeDriver: true,
      duration: 60,
    }).start();
  };

  const animateActiveEdgeEnd = (position: CropHandleEdgePosition) => {
    let animatedValue;

    switch (position) {
      case "top": {
        animatedValue = topEdgeActivityIndicatorScale;
        break;
      }
      case "bottom": {
        animatedValue = bottomEdgeActivityIndicatorScale;
        break;
      }
      case "right": {
        animatedValue = rightEdgeActivityIndicatorScale;
        break;
      }
      default:
      case "left": {
        animatedValue = leftEdgeActivityIndicatorScale;
        break;
      }
    }

    Animated.timing(animatedValue.current, {
      toValue: 0,
      useNativeDriver: true,
      duration: 80,
      easing: Easing.in(Easing.poly(4)),
    }).start();
  };

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

  const ScrolWheelCaptureWrapper = (props: React.PropsWithChildren<any>) => {
    return Platform.OS === "web" ? (
      <div onWheel={onWheel}>{props.children}</div>
    ) : (
      <>{props.children}</>
    );
  };

  return (
    <ScrolWheelCaptureWrapper>
      <Animated.View
        style={[
          styles.container,
          {
            transform: [
              {
                translateX: viewportOffset.current.x,
              },
              {
                translateY: viewportOffset.current.y,
              },
            ],
          },
        ]}
        {...imageDragAndPinchResponder.panHandlers}
      >
        {/* OVERFLOW IMAGE */}
        <Animated.View
          style={[
            imageContainerStyle,
            styles.overflowImageContainer,
            { opacity: animatedOverflowImageOpacity.current },
          ]}
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
                // console.log("IMAGE LOADED", event.nativeEvent.source);
              }}
            />
          </Animated.View>

          {/* CROP BOX */}
          <Animated.View
            style={[
              styles.cropBox,
              cropBoxStyle,
              { display: props.circular ? "none" : "flex" },
            ]}
          >
            {/* EDGE HANDLES */}
            {/* TOP */}
            <View
              style={[styles.topEdgeHandle]}
              pointerEvents={props.fixedRatio ? "none" : "auto"}
            >
              <Animated.View
                style={[
                  styles.topEdgeActivityIndicator,
                  {
                    transform: [
                      {
                        scaleY: topEdgeActivityIndicatorScale.current,
                      },
                    ],
                  },
                ]}
              />
              <View
                style={styles.topEdgeOuterHandle}
                {...getEdgeCropHandlePanResponder("top").panHandlers}
              />
            </View>

            {/* BOTTOM */}
            <View
              style={[styles.bottomEdgeHandle]}
              pointerEvents={props.fixedRatio ? "none" : "auto"}
            >
              <Animated.View
                style={[
                  styles.bottomEdgeActivityIndicator,
                  {
                    transform: [
                      {
                        scaleY: bottomEdgeActivityIndicatorScale.current,
                      },
                    ],
                  },
                ]}
              />
              <View
                style={styles.bottomEdgeOuterHandle}
                {...getEdgeCropHandlePanResponder("bottom").panHandlers}
              />
            </View>

            {/* LEFT */}
            <View
              style={[styles.leftEdgeHandle]}
              pointerEvents={props.fixedRatio ? "none" : "auto"}
            >
              <Animated.View
                style={[
                  styles.leftEdgeActivityIndicator,
                  {
                    transform: [
                      {
                        scaleX: leftEdgeActivityIndicatorScale.current,
                      },
                    ],
                  },
                ]}
              />
              <View
                style={styles.leftEdgeOuterHandle}
                {...getEdgeCropHandlePanResponder("left").panHandlers}
              />
            </View>

            {/* RIGHT */}
            <View
              style={[styles.rightEdgeHandle]}
              pointerEvents={props.fixedRatio ? "none" : "auto"}
            >
              <Animated.View
                style={[
                  styles.rightEdgeActivityIndicator,
                  {
                    transform: [
                      {
                        scaleX: rightEdgeActivityIndicatorScale.current,
                      },
                    ],
                  },
                ]}
              />
              <View
                style={styles.rightEdgeOuterHandle}
                {...getEdgeCropHandlePanResponder("right").panHandlers}
              />
            </View>

            {/* CORNER HANDLES */}
            <View style={[styles.topLeftCornerHandle]}>
              <View
                style={styles.topLeftCornerOuterHandle}
                {...getCornerCropHandlePanResponder("top-left").panHandlers}
              />
            </View>
            <View style={[styles.topRightCornerHandle]}>
              <View
                style={styles.topRightCornerOuterHandle}
                {...getCornerCropHandlePanResponder("top-right").panHandlers}
              />
            </View>
            <View style={[styles.bottomLeftCornerHandle]}>
              <View
                style={styles.bottomLeftCornerOuterHandle}
                {...getCornerCropHandlePanResponder("bottom-left").panHandlers}
              />
            </View>
            <View style={[styles.bottomRightCornerHandle]}>
              <View
                style={styles.bottomRightCornerOuterHandle}
                {...getCornerCropHandlePanResponder("bottom-right").panHandlers}
              />
            </View>
          </Animated.View>
        </View>
      </Animated.View>
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
  activeEdgeHandleTop: {
    borderTopWidth: 3,
  },
  activeEdgeHandleBottom: {
    borderBottomWidth: 3,
  },
  activeEdgeHandleRight: {
    borderRightWidth: 3,
  },
  activeEdgeHandleLeft: {
    borderLeftWidth: 3,
  },
  topEdgeHandle: {
    cursor: "ns-resize",
    position: "absolute",
    left: 24,
    right: 24,
    height: 20,
    borderTopColor: "#EEE",
    borderTopWidth: 1,
  },
  bottomEdgeHandle: {
    cursor: "ns-resize",
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 0,
    height: 20,
    borderColor: "#EEE",
    borderBottomWidth: 1,
  },
  rightEdgeHandle: {
    cursor: "ew-resize",
    position: "absolute",
    top: 24,
    bottom: 24,
    right: 0,
    width: 20,
    borderColor: "#EEE",
    borderRightWidth: 1,
  },
  leftEdgeHandle: {
    cursor: "ew-resize",
    position: "absolute",
    top: 24,
    bottom: 24,
    left: 0,
    width: 20,
    borderColor: "#EEE",
    borderLeftWidth: 1,
  },
  topEdgeActivityIndicator: {
    position: "absolute",
    top: -2,
    height: 5,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
  },
  bottomEdgeActivityIndicator: {
    position: "absolute",
    bottom: -2,
    height: 5,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
  },
  leftEdgeActivityIndicator: {
    position: "absolute",
    left: -2,
    width: 5,
    top: 0,
    bottom: 0,
    backgroundColor: "#FFF",
  },
  rightEdgeActivityIndicator: {
    position: "absolute",
    right: -2,
    width: 5,
    top: 0,
    bottom: 0,
    backgroundColor: "#FFF",
  },
  topLeftCornerHandle: {
    zIndex: 10,
    opacity: 0.7,
    cursor: "nwse-resize",
    position: "absolute",
    left: 0,
    top: 0,
    width: 24,
    height: 24,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderColor: "#fff",
  },
  topRightCornerHandle: {
    zIndex: 10,
    cursor: "nesw-resize",
    opacity: 0.7,
    position: "absolute",
    top: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderColor: "#fff",
  },
  bottomLeftCornerHandle: {
    zIndex: 10,
    cursor: "nesw-resize",
    opacity: 0.7,
    position: "absolute",
    left: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: "#fff",
  },
  bottomRightCornerHandle: {
    zIndex: 10,
    cursor: "nwse-resize",
    opacity: 0.7,
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: "#fff",
  },
  topLeftCornerOuterHandle: {
    zIndex: 10,
    cursor: "nwse-resize",
    position: "absolute",
    left: -24,
    top: -24,
    width: 48,
    height: 48,
  },
  topRightCornerOuterHandle: {
    zIndex: 10,
    cursor: "nesw-resize",
    position: "absolute",
    top: -24,
    right: -24,
    width: 48,
    height: 48,
  },
  bottomLeftCornerOuterHandle: {
    zIndex: 10,
    cursor: "nesw-resize",
    position: "absolute",
    left: -24,
    bottom: -24,
    width: 48,
    height: 48,
  },
  bottomRightCornerOuterHandle: {
    zIndex: 10,
    cursor: "nwse-resize",
    position: "absolute",
    right: -24,
    bottom: -24,
    width: 48,
    height: 48,
  },
  topEdgeOuterHandle: {
    height: 40,
    top: -20,
    left: 0,
    right: 0,
    position: "absolute",
    cursor: "ns-resize",
  },
  bottomEdgeOuterHandle: {
    height: 40,
    position: "absolute",
    bottom: -20,
    left: 0,
    right: 0,
    cursor: "ns-resize",
  },
  leftEdgeOuterHandle: {
    width: 40,
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -20,
    cursor: "ew-resize",
  },
  rightEdgeOuterHandle: {
    width: 40,
    position: "absolute",
    top: 0,
    bottom: 0,
    right: -20,
    cursor: "ew-resize",
  },
});
