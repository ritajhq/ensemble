declare const __TAURI__: {
  core: { invoke(command: string, args: object): Promise<number> };
};

const amount = document.querySelector<HTMLInputElement>("#amount")!;
const total = document.querySelector<HTMLOutputElement>("#total")!;

document.querySelector("form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = await __TAURI__.core.invoke("record", {
    amount: amount.valueAsNumber,
  });
  total.value = value.toFixed(2);
});
