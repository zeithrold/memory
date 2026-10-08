'use client'

import type { ComponentProps, CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { disabledClass, focusClass } from './classes.js'
import { cn } from './cn.js'

export type ColorOption = {
  value: string
  label: string
  foreground?: string
  background?: string
  disabled?: boolean
  testId?: string
}
export type ColorGridProps = Omit<ComponentProps<'fieldset'>, 'onChange' | 'children'> & {
  label: string
  options: readonly ColorOption[]
  value: string
  onValueChange: (value: string) => void
}
function ColorSample({ option }: { option: ColorOption }): React.JSX.Element {
  const style: CSSProperties = {
    ...(option.foreground === undefined ? {} : { color: option.foreground }),
    ...(option.background === undefined ? {} : { backgroundColor: option.background }),
  }
  return (
    <span
      className={cn('grid size-6 place-items-center rounded-md border border-border text-sm')}
      style={style}
    >
      A
    </span>
  )
}
export function ColorGrid({
  label,
  options,
  value,
  onValueChange,
  disabled = false,
  className = '',
  ...props
}: ColorGridProps): React.JSX.Element {
  return (
    <fieldset
      data-slot="color-grid"
      className={cn(`ztd-color-grid m-0 grid min-w-0 gap-2 border-0 p-0 ${className}`)}
      disabled={disabled}
      {...props}
    >
      <legend className={cn('mb-2 text-help font-medium text-muted-foreground')}>{label}</legend>
      <div className={cn('grid grid-cols-5 gap-1.5')}>
        {options.map(option => (
          <button
            key={option.value}
            data-test={option.testId}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={value === option.value}
            disabled={disabled || option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn([
              'relative grid min-h-11 min-w-11 place-items-center rounded-lg border',
              'border-transparent bg-transparent text-foreground hover:bg-muted',
              'aria-pressed:border-border aria-pressed:bg-muted',
              focusClass,
              disabledClass,
            ].join(' '))}
          >
            <ColorSample option={option} />
            {value === option.value
              ? (
                  <Check
                    className={cn('absolute end-0.5 bottom-0.5 rounded-full bg-surface')}
                    size={12}
                    aria-hidden="true"
                  />
                )
              : null}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
