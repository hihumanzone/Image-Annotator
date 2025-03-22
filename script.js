(function() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const imageLoader = document.getElementById('imageLoader');
  const jsonLoader = document.getElementById('jsonLoader');
  const jsonModal = document.getElementById('jsonModal');
  const jsonTextarea = document.getElementById('jsonTextarea');

  let image = new Image();
  let imageLoaded = false;
  let imageResolution = { width: 0, height: 0 };
  let lines = [];
  let currentTool = 'draw';
  let drawing = false;
  let currentLine = null;
  let drawStartTime = 0;
  let erasedStack = [];

  let transform = { scale: 1, rotation: 0, centerX: 0, centerY: 0 };
  let baseScale = 1;
  let isGesture = false;
  let gestureInitialDistance = 0;
  let gestureInitialAngle = 0;
  let gestureInitialCenter = { x: 0, y: 0 };
  let gestureInitialImageCoord = { x: 0, y: 0 };
  let initialTransform = { scale: 1, rotation: 0, centerX: 0, centerY: 0 };

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (imageLoaded) {
      transform.centerX = canvas.width / 2;
      transform.centerY = canvas.height / 2;
    }
    draw();
  }

  function transformPoint(x, y) {
    const dx = x - image.width / 2;
    const dy = y - image.height / 2;
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;
    return {
      x: transform.centerX + rotatedX * transform.scale,
      y: transform.centerY + rotatedY * transform.scale
    };
  }

  function toImageCoords(x, y) {
    let dx = x - transform.centerX;
    let dy = y - transform.centerY;
    dx /= transform.scale;
    dy /= transform.scale;
    const cos = Math.cos(-transform.rotation);
    const sin = Math.sin(-transform.rotation);
    return {
      x: dx * cos - dy * sin + image.width / 2,
      y: dx * sin + dy * cos + image.height / 2
    };
  }

  function getTouchDistance(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }
  
  function getTouchAngle(t1, t2) {
    return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
  }

  function pointToSegmentDistance(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.hypot(p.x - projection.x, p.y - projection.y);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (imageLoaded) {
      ctx.save();
      ctx.translate(transform.centerX, transform.centerY);
      ctx.rotate(transform.rotation);
      ctx.scale(transform.scale, transform.scale);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      ctx.restore();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'red';
    lines.forEach(line => {
      const start = transformPoint(line.start.x, line.start.y);
      const end = transformPoint(line.end.x, line.end.y);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });
    if (drawing && currentLine) {
      const start = transformPoint(currentLine.start.x, currentLine.start.y);
      const end = transformPoint(currentLine.end.x, currentLine.end.y);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  function updateActiveTool() {
    document.querySelectorAll('#toolbar button').forEach(btn => btn.classList.remove('active'));
    if (currentTool === 'draw') {
      document.getElementById('drawToolBtn').classList.add('active');
    } else if (currentTool === 'erase') {
      document.getElementById('eraserToolBtn').classList.add('active');
    }
  }

  function handlePointerDown(e) {
    if (e.touches && e.touches.length >= 2) {
      drawing = false;
      currentLine = null;
      e.preventDefault();
      isGesture = true;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      gestureInitialDistance = getTouchDistance(t1, t2);
      gestureInitialAngle = getTouchAngle(t1, t2);
      const initialCenterCanvas = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      gestureInitialCenter = initialCenterCanvas;
      gestureInitialImageCoord = toImageCoords(initialCenterCanvas.x, initialCenterCanvas.y);
      initialTransform = {
        scale: transform.scale,
        rotation: transform.rotation,
        centerX: transform.centerX,
        centerY: transform.centerY
      };
      return;
    }
    if (!imageLoaded) return;
    const pos = e.touches
      ? toImageCoords(e.touches[0].clientX, e.touches[0].clientY)
      : toImageCoords(e.clientX, e.clientY);
    if (currentTool === 'draw') {
      drawing = true;
      currentLine = { start: pos, end: pos };
      drawStartTime = Date.now();
    } else if (currentTool === 'erase') {
      eraseAt(pos);
    }
  }

  function handlePointerMove(e) {
    if (e.touches && e.touches.length >= 2 && isGesture) {
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const currentDistance = getTouchDistance(t1, t2);
      const currentAngle = getTouchAngle(t1, t2);
      const currentCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      const newScale = initialTransform.scale * (currentDistance / gestureInitialDistance);
      const newRotation = initialTransform.rotation + (currentAngle - gestureInitialAngle);
      transform.scale = newScale;
      transform.rotation = newRotation;
      transform.centerX = currentCenter.x - newScale * (
        Math.cos(newRotation) * (gestureInitialImageCoord.x - image.width / 2) -
        Math.sin(newRotation) * (gestureInitialImageCoord.y - image.height / 2)
      );
      transform.centerY = currentCenter.y - newScale * (
        Math.sin(newRotation) * (gestureInitialImageCoord.x - image.width / 2) +
        Math.cos(newRotation) * (gestureInitialImageCoord.y - image.height / 2)
      );
      draw();
      return;
    }
    if (!imageLoaded) return;
    const pos = e.touches
      ? toImageCoords(e.touches[0].clientX, e.touches[0].clientY)
      : toImageCoords(e.clientX, e.clientY);
    if (currentTool === 'draw' && drawing && !isGesture) {
      currentLine.end = pos;
      draw();
    } else if (currentTool === 'erase' && !isGesture) {
      eraseAt(pos);
    }
  }

  function handlePointerUp(e) {
    if (e.touches && isGesture && e.touches.length < 2) {
      isGesture = false;
      return;
    }
    if (currentTool === 'draw' && drawing && !isGesture) {
      const duration = Date.now() - drawStartTime;
      if (duration >= 200) {
        lines.push({
          start: { x: Math.round(currentLine.start.x), y: Math.round(currentLine.start.y) },
          end: { x: Math.round(currentLine.end.x), y: Math.round(currentLine.end.y) }
        });
      }
      currentLine = null;
      drawing = false;
      draw();
    }
  }

  function eraseAt(pos) {
    const threshold = 5 / transform.scale;
    let closestIndex = -1;
    let closestDistance = Infinity;
    lines.forEach((line, index) => {
      const dist = pointToSegmentDistance(pos, line.start, line.end);
      if (dist <= threshold && dist < closestDistance) {
        closestDistance = dist;
        closestIndex = index;
      }
    });
    if (closestIndex !== -1) {
      erasedStack.push({ line: lines[closestIndex], index: closestIndex });
      lines.splice(closestIndex, 1);
      draw();
    }
  }

  function setupToolbar() {
    document.getElementById('selectImageBtn').addEventListener('click', () => imageLoader.click());
    imageLoader.addEventListener('change', handleImageSelect);
    document.getElementById('drawToolBtn').addEventListener('click', () => {
      currentTool = 'draw';
      updateActiveTool();
    });
    document.getElementById('eraserToolBtn').addEventListener('click', () => {
      currentTool = 'erase';
      updateActiveTool();
    });
    document.getElementById('undoBtn').addEventListener('click', () => {
      if (erasedStack.length) {
        const lastErased = erasedStack.pop();
        lines.splice(lastErased.index, 0, lastErased.line);
        draw();
      }
    });
    document.getElementById('resetBtn').addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all lines? This action cannot be undone.')) {
        lines = [];
        draw();
      }
    });
    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      const output = { imageResolution, lines };
      const jsonStr = JSON.stringify(output, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'annotations.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    document.getElementById('loadJsonBtn').addEventListener('click', () => jsonLoader.click());
    jsonLoader.addEventListener('change', handleJsonLoad);
    document.getElementById('editJsonBtn').addEventListener('click', () => {
      openJsonEditor();
    });
    document.getElementById('updateJsonBtn').addEventListener('click', handleJsonUpdate);
    document.getElementById('closeJsonModal').addEventListener('click', () => {
      jsonModal.style.display = 'none';
    });
    document.getElementById('cancelJsonBtn').addEventListener('click', () => {
      jsonModal.style.display = 'none';
    });
    
    // Tab switching in JSON modal
    document.getElementById('tableViewTab').addEventListener('click', () => {
      switchJsonTab('tableView');
    });
    document.getElementById('rawJsonTab').addEventListener('click', () => {
      switchJsonTab('rawJsonView');
    });
    
    // Add line button
    document.getElementById('addLineBtn').addEventListener('click', addNewLine);
    
    document.getElementById('menuToggle').addEventListener('click', () => {
      const toolbar = document.getElementById('toolbar');
      toolbar.classList.toggle('expanded');
    });
    
    if (window.innerWidth <= 768) {
      document.querySelectorAll('#toolbar button').forEach(button => {
        button.addEventListener('click', () => {
          if (window.innerWidth <= 768) {
            setTimeout(() => {
              document.getElementById('toolbar').classList.remove('expanded');
            }, 300);
          }
        });
      });
    }
  }

  function switchJsonTab(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.add('hidden');
    });
    
    // Show the selected tab content
    document.getElementById(tabId).classList.remove('hidden');
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeTab = tabId === 'tableView' ? 'tableViewTab' : 'rawJsonTab';
    document.getElementById(activeTab).classList.add('active');
    
    // If switching to raw JSON, update the textarea from table view
    if (tabId === 'rawJsonView') {
      updateJsonFromTable();
    } else if (tabId === 'tableView') {
      // Try to update table from JSON
      try {
        const data = JSON.parse(jsonTextarea.value);
        if (validateJsonData(data)) {
          populateLinesTable(data.lines);
          updateResolutionDisplay(data.imageResolution);
        }
      } catch (err) {
        // If there's an error, don't do anything - stay in table view with current data
      }
    }
  }
  
  function validateJsonData(data) {
    // Hide any previous error message
    const errorEl = document.getElementById('jsonError');
    errorEl.style.display = 'none';
    
    if (!data.imageResolution || typeof data.imageResolution !== 'object') {
      showJsonError('Missing or invalid imageResolution object');
      return false;
    }
    
    if (!data.imageResolution.width || !data.imageResolution.height ||
        typeof data.imageResolution.width !== 'number' || 
        typeof data.imageResolution.height !== 'number') {
      showJsonError('Invalid image resolution width or height');
      return false;
    }
    
    if (!Array.isArray(data.lines)) {
      showJsonError('Lines must be an array');
      return false;
    }
    
    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];
      if (!line.start || !line.end || 
          typeof line.start.x !== 'number' || typeof line.start.y !== 'number' ||
          typeof line.end.x !== 'number' || typeof line.end.y !== 'number') {
        showJsonError(`Invalid line at index ${i}`);
        return false;
      }
    }
    
    return true;
  }
  
  function showJsonError(message) {
    const errorEl = document.getElementById('jsonError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
  
  function openJsonEditor() {
    // Prepare table view
    const output = { imageResolution, lines };
    populateLinesTable(lines);
    updateResolutionDisplay(imageResolution);
    
    // Prepare raw JSON view
    jsonTextarea.value = JSON.stringify(output, null, 2);
    
    // Show the modal with table view active by default
    jsonModal.style.display = 'block';
    switchJsonTab('tableView');
  }
  
  function updateResolutionDisplay(resolution) {
    document.getElementById('imageWidth').textContent = resolution.width;
    document.getElementById('imageHeight').textContent = resolution.height;
  }
  
  function populateLinesTable(lines) {
    const tbody = document.getElementById('linesTableBody');
    tbody.innerHTML = '';
    
    lines.forEach((line, index) => {
      const tr = document.createElement('tr');
      tr.dataset.index = index;
      
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${line.start.x}</td>
        <td>${line.start.y}</td>
        <td>${line.end.x}</td>
        <td>${line.end.y}</td>
        <td class="table-actions">
          <i class="fas fa-edit edit-btn" data-index="${index}"></i>
          <i class="fas fa-trash delete-btn" data-index="${index}"></i>
        </td>
      `;
      
      tbody.appendChild(tr);
    });
    
    // Add event listeners to edit and delete buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => editLine(parseInt(btn.dataset.index)));
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteLine(parseInt(btn.dataset.index)));
    });
  }
  
  function editLine(index) {
    const line = lines[index];
    const tr = document.querySelector(`tr[data-index="${index}"]`);
    
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><input type="number" class="number-input" value="${line.start.x}" id="edit-startX-${index}"></td>
      <td><input type="number" class="number-input" value="${line.start.y}" id="edit-startY-${index}"></td>
      <td><input type="number" class="number-input" value="${line.end.x}" id="edit-endX-${index}"></td>
      <td><input type="number" class="number-input" value="${line.end.y}" id="edit-endY-${index}"></td>
      <td class="table-actions">
        <i class="fas fa-check edit-save-btn" data-index="${index}"></i>
        <i class="fas fa-times edit-cancel-btn" data-index="${index}"></i>
      </td>
    `;
    
    document.querySelector(`.edit-save-btn[data-index="${index}"]`).addEventListener('click', () => saveLineEdit(index));
    document.querySelector(`.edit-cancel-btn[data-index="${index}"]`).addEventListener('click', () => cancelLineEdit());
  }
  
  function saveLineEdit(index) {
    const startX = parseInt(document.getElementById(`edit-startX-${index}`).value);
    const startY = parseInt(document.getElementById(`edit-startY-${index}`).value);
    const endX = parseInt(document.getElementById(`edit-endX-${index}`).value);
    const endY = parseInt(document.getElementById(`edit-endY-${index}`).value);
    
    // Validate inputs
    if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) {
      alert('All values must be valid numbers');
      return;
    }
    
    // Update the line
    lines[index] = {
      start: { x: startX, y: startY },
      end: { x: endX, y: endY }
    };
    
    // Refresh the table
    populateLinesTable(lines);
    
    // Update the JSON textarea
    updateJsonFromTable();
  }
  
  function cancelLineEdit() {
    // Simply refresh the table to its original state
    populateLinesTable(lines);
  }
  
  function deleteLine(index) {
    if (confirm('Are you sure you want to delete this line?')) {
      lines.splice(index, 1);
      populateLinesTable(lines);
      updateJsonFromTable();
    }
  }
  
  function addNewLine() {
    const newLine = {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 }
    };
    
    lines.push(newLine);
    populateLinesTable(lines);
    updateJsonFromTable();
    
    // Scroll to the bottom of the table to show the new line
    const tableContainer = document.querySelector('.table-container');
    tableContainer.scrollTop = tableContainer.scrollHeight;
  }
  
  function updateJsonFromTable() {
    const output = { imageResolution, lines };
    jsonTextarea.value = JSON.stringify(output, null, 2);
  }

  function handleJsonUpdate() {
    // Check which view is active
    const isTableViewActive = !document.getElementById('tableView').classList.contains('hidden');
    
    if (isTableViewActive) {
      // When in table view, the data is already updated in the lines array
      draw();
      jsonModal.style.display = 'none';
    } else {
      // When in raw JSON view, parse the JSON and validate
      try {
        const data = JSON.parse(jsonTextarea.value);
        if (validateJsonData(data)) {
          imageResolution = data.imageResolution;
          lines = data.lines;
          draw();
          jsonModal.style.display = 'none';
        }
      } catch (err) {
        showJsonError('Invalid JSON format: ' + err.message);
      }
    }
  }

  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      image.onload = function() {
        imageLoaded = true;
        imageResolution = { width: image.width, height: image.height };
        baseScale = Math.min(canvas.width / image.width, canvas.height / image.height);
        transform = {
          scale: baseScale,
          rotation: 0,
          centerX: canvas.width / 2,
          centerY: canvas.height / 2
        };
        draw();
      }
      image.src = event.target.result;
    }
    reader.readAsDataURL(file);
  }

  function handleJsonLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const data = JSON.parse(event.target.result);
        if (validateJsonData(data)) {
          imageResolution = data.imageResolution;
          lines = data.lines;
          draw();
        } else {
          alert('Invalid JSON format.');
        }
      } catch (err) {
        alert('Error parsing JSON: ' + err.message);
      }
    }
    reader.readAsText(file);
  }

  function setupCanvasEvents() {
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
    canvas.addEventListener('touchend', handlePointerUp);
  }

  function init() {
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    setupToolbar();
    setupCanvasEvents();
    updateActiveTool();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
