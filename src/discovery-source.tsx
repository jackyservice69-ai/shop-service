import { useState } from "react";
import { Field, formObject } from "./ui";

const sources = ["Line", "Facebook", "โฆษณา", "Google", "Youtube", "อื่นๆ"];

export function DiscoverySourceField() {
  const [source, setSource] = useState("");
  return (
    <>
      <Field
        label="รู้จักเราจากที่ไหน"
        name="discoverySource"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        help="ไม่บังคับ"
      >
        <option value="">เลือกช่องทาง</option>
        {sources.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </Field>
      {source === "อื่นๆ" && (
        <Field
          label="ระบุช่องทางอื่นๆ"
          name="discoverySourceOther"
          required
          maxLength={120}
          pattern={".*\\S.*"}
          autoComplete="off"
          placeholder="ระบุว่าคุณรู้จักเราจากที่ไหน"
          help="ไม่เกิน 120 ตัวอักษร"
        />
      )}
    </>
  );
}

export function registrationValues(form: HTMLFormElement) {
  const { discoverySourceOther, ...values } = formObject(form);
  return {
    ...values,
    discoverySource:
      values.discoverySource === "อื่นๆ"
        ? String(discoverySourceOther || "").trim()
        : values.discoverySource || "",
  };
}
