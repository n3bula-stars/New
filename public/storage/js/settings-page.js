function exportLocalStorage() {
      const data = JSON.stringify(localStorage, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "localStorage-export.json";
      a.click();

      URL.revokeObjectURL(url);
    }
    function importLocalStorage() {
      const fileInput = document.getElementById("fileInput");
      const file = fileInput.files[0];

      if (!file) {
        alert("Please select a JSON file first.");
        return;
      }

      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const data = JSON.parse(event.target.result);
          for (const key in data) {
            localStorage.setItem(key, data[key]);
          }
          alert("LocalStorage imported successfully");
        } catch (err) {
          alert("Failed to parse JSON: " + err.message);
        }
      };
      reader.readAsText(file);
    }