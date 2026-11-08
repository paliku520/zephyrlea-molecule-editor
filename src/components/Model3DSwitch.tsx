import {
  BallStickModelIcon,
  SpaceFillModelIcon,
  StickModelIcon,
  WireframeModelIcon,
} from './icons/ChemIcons';
import { IconRadioFrame, IconRadioGroup, type IconRadioOption } from './ui/IconRadioGroup';
import { MODEL_3D_STYLE_OPTIONS, type Model3DStyle } from '../lib/settings';

const MODEL_ICONS: Record<Model3DStyle, typeof BallStickModelIcon> = {
  'ball-stick': BallStickModelIcon,
  'space-fill': SpaceFillModelIcon,
  stick: StickModelIcon,
  wireframe: WireframeModelIcon,
};

/** Shared with the 3D viewer's bottom toolbar. */
export const MODEL_3D_STYLE_CHOICES: IconRadioOption<Model3DStyle>[] =
  MODEL_3D_STYLE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    hint: option.hint,
    icon: MODEL_ICONS[option.value],
  }));

interface Model3DSwitchProps {
  value: Model3DStyle;
  onChange: (style: Model3DStyle) => void;
}

/** Icon-only model picker for the settings modal. */
export function Model3DSwitch({ value, onChange }: Model3DSwitchProps) {
  return (
    <IconRadioFrame>
      <IconRadioGroup
        label="3D 模型样式"
        value={value}
        options={MODEL_3D_STYLE_CHOICES}
        onChange={onChange}
      />
    </IconRadioFrame>
  );
}
